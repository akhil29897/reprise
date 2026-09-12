use crate::engine::Engine;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
};
pub fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
pub fn terminal(s: &str) -> bool {
    matches!(
        s,
        "completed" | "partial" | "failed" | "cancelled" | "interrupted"
    )
}
pub struct Store {
    pub root: PathBuf,
    pub engine: Engine,
    pub jobs: Mutex<HashMap<String, Value>>,
    pub cancels: Mutex<HashMap<String, Arc<AtomicBool>>>,
    sender: Mutex<mpsc::SyncSender<String>>,
}
impl Store {
    pub fn new(root: PathBuf, engine: Engine) -> Result<Arc<Self>, String> {
        fs::create_dir_all(root.join("files")).map_err(|e| e.to_string())?;
        fs::create_dir_all(root.join("jobs")).map_err(|e| e.to_string())?;
        let (tx, rx) = mpsc::sync_channel(32);
        let mut jobs = HashMap::new();
        for entry in fs::read_dir(root.join("jobs"))
            .map_err(|e| e.to_string())?
            .flatten()
        {
            let p = entry.path().join("job.json");
            if let Ok(raw) = fs::read(&p) {
                if let Ok(mut j) = serde_json::from_slice::<Value>(&raw) {
                    if let Some(id) = j["id"].as_str().map(String::from) {
                        if !terminal(j["status"].as_str().unwrap_or("")) {
                            j["status"] = json!("interrupted");
                            j["stage"] = json!("interrupted");
                            j["error"] = json!("Companion stopped before this job finished");
                            j["updatedAt"] = json!(now());
                            fs::write(&p, serde_json::to_vec_pretty(&j).unwrap())
                                .map_err(|e| e.to_string())?;
                        }
                        jobs.insert(id, j);
                    }
                }
            }
        }
        let store = Arc::new(Self {
            root,
            engine,
            jobs: Mutex::new(jobs),
            cancels: Mutex::new(HashMap::new()),
            sender: Mutex::new(tx),
        });
        let worker = store.clone();
        thread::spawn(move || {
            for id in rx {
                worker.process(&id)
            }
        });
        Ok(store)
    }
    pub fn update(&self, id: &str, f: impl FnOnce(&mut Value)) -> Result<Value, String> {
        let mut jobs = self.jobs.lock().unwrap();
        let j = jobs.get_mut(id).ok_or("Job not found")?;
        f(j);
        j["updatedAt"] = json!(now());
        let dir = self.root.join("jobs").join(id);
        let tmp = dir.join("job.json.tmp");
        fs::write(&tmp, serde_json::to_vec_pretty(j).unwrap()).map_err(|e| e.to_string())?;
        fs::rename(tmp, dir.join("job.json")).map_err(|e| e.to_string())?;
        Ok(j.clone())
    }
    pub fn get(&self, id: &str) -> Option<Value> {
        self.jobs.lock().unwrap().get(id).cloned()
    }
    pub fn create(
        &self,
        file_id: &str,
        reference: Option<&str>,
        strategy: &str,
        name: &str,
    ) -> Result<Value, String> {
        let id = uuid::Uuid::new_v4().to_string();
        fs::create_dir(self.root.join("jobs").join(&id)).map_err(|e| e.to_string())?;
        let j = json!({"id":id,"fileId":file_id,"referenceId":reference,"strategy":strategy,"name":name,"status":"queued","stage":"queued","progress":null,"createdAt":now(),"updatedAt":now()});
        self.jobs.lock().unwrap().insert(id.clone(), j);
        self.cancels
            .lock()
            .unwrap()
            .insert(id.clone(), Arc::new(AtomicBool::new(false)));
        let j = self.update(&id, |_| {})?;
        if self.sender.lock().unwrap().try_send(id.clone()).is_err() {
            let _ = self.update(&id, |j| {
                j["status"] = json!("failed");
                j["stage"] = json!("failed");
                j["error"] = json!("Job queue is full");
            });
            return Err("Job queue is full".into());
        }
        Ok(j)
    }
    fn process(&self, id: &str) {
        let mut claimed = false;
        let j = match self.update(id, |j| {
            if !terminal(j["status"].as_str().unwrap_or("")) {
                claimed = true;
                j["status"] = json!("probing");
                j["stage"] = json!("probing");
            }
        }) {
            Ok(j) => j,
            Err(_) => return,
        };
        if !claimed {
            return;
        }
        let cancel = self.cancels.lock().unwrap().get(id).unwrap().clone();
        let input = self
            .root
            .join("files")
            .join(j["fileId"].as_str().unwrap())
            .join("input");
        let reference = j["referenceId"]
            .as_str()
            .map(|id| self.root.join("files").join(id).join("input"));
        let dir = self.root.join("jobs").join(id);
        let mut report = json!({"summary":"Repair did not produce a validated output.","strategy":j["strategy"],"inputSha256":"","streams":[],"validation":{"fullDecode":false,"errorCount":0,"notes":[]},"warnings":[],"engineVersions":{}});
        let result = self.engine.repair(
            &input,
            reference.as_deref(),
            j["strategy"].as_str().unwrap(),
            &dir,
            cancel.clone(),
            |stage| {
                let _ = self.update(id, |j| {
                    j["status"] = json!(stage);
                    j["stage"] = json!(stage);
                });
            },
            &mut report,
        );
        let cancelled = cancel.load(Ordering::SeqCst);
        if let Err(e) = &result {
            report["summary"] = json!(e);
            report["validation"]["notes"] = json!([e]);
        }
        if cancelled {
            report["summary"] = json!("Job cancelled. No output is offered.");
        }
        let report_write = fs::write(
            dir.join("report.json"),
            serde_json::to_vec_pretty(&report).unwrap(),
        );
        let _ = self.update(id, |j| {
            j["report"] = report;
            if cancelled {
                j["status"] = json!("cancelled");
            } else {
                match result {
                    Ok((output, complete)) if report_write.is_ok() => {
                        j["status"] = json!(if complete { "completed" } else { "partial" });
                        j["outputName"] = json!(output.file_name().unwrap().to_string_lossy());
                        j["outputSize"] = json!(fs::metadata(output).map(|m| m.len()).unwrap_or(0));
                    }
                    Ok(_) => {
                        j["status"] = json!("failed");
                        j["error"] = json!("Could not persist report");
                    }
                    Err(e) => {
                        j["status"] = json!("failed");
                        j["error"] = json!(e);
                    }
                }
            }
            j["stage"] = j["status"].clone();
        });
    }
    pub fn cancel(&self, id: &str) -> Result<Value, String> {
        let j = self.get(id).ok_or("Job not found")?;
        if terminal(j["status"].as_str().unwrap_or("")) {
            return Ok(j);
        }
        if let Some(c) = self.cancels.lock().unwrap().get(id) {
            c.store(true, Ordering::SeqCst);
        }
        let current = self.update(id, |j| {
            if j["status"] == "queued" {
                j["status"] = json!("cancelled");
                j["stage"] = json!("cancelled");
            }
        })?;
        if current["status"] == "cancelled" {
            return Ok(current);
        }
        // Engine worker kills and reaps its child before publishing a terminal status.
        for _ in 0..200 {
            let j = self.get(id).unwrap();
            if terminal(j["status"].as_str().unwrap_or("")) {
                return Ok(j);
            }
            thread::sleep(std::time::Duration::from_millis(50));
        }
        Err("Cancellation is still waiting for the engine to stop".into())
    }
}
