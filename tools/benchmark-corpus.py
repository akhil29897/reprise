"""Reproduce the small Reprise real-world regression run; media are not redistributed."""
from pathlib import Path
import os, urllib.request, urllib.error, json, subprocess, time, hashlib, resource
ROOT=Path(__file__).resolve().parent
CORPUS=ROOT/'corpus'; OUT=ROOT/'corpus-results'; OUT.mkdir(exist_ok=True)
TOKEN=os.environ.get('REPRISE_BENCH_TOKEN','')
if not TOKEN: raise SystemExit('Set REPRISE_BENCH_TOKEN to your running local companion token')
def api(method,path,data=None):
 headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/octet-stream'}
 req=urllib.request.Request('http://127.0.0.1:47831/v1'+path,data=data,headers=headers,method=method)
 with urllib.request.urlopen(req,timeout=30) as r: return r.read()
def limit():
 resource.setrlimit(resource.RLIMIT_FSIZE,(8*1024*1024,8*1024*1024))
 resource.setrlimit(resource.RLIMIT_CPU,(30,30))
def baseline(file,folder):
 args=['ffmpeg','-nostdin','-v','error','-max_alloc','268435456','-protocol_whitelist','file,pipe','-i',str(file),'-map','0:v?','-map','0:a?','-progress','pipe:1','-f','null','-']
 start=time.monotonic()
 with (folder/'baseline-errors.log').open('wb') as err, (folder/'baseline-progress.log').open('wb') as out:
  try: run=subprocess.run(args,stdin=subprocess.DEVNULL,stdout=out,stderr=err,timeout=35,preexec_fn=limit);code=run.returncode
  except subprocess.TimeoutExpired: code='timeout'
 lines=(folder/'baseline-errors.log').read_text(errors='replace').splitlines()
 values={}
 for line in (folder/'baseline-progress.log').read_text().splitlines():
  if '=' in line:
   k,v=line.split('=',1);values[k]=v
 return {'exitCode':code,'errorLines':len(lines),'errors':lines[:12],'seconds':round(time.monotonic()-start,3),'lastProgress':values}
results=[]
for item in json.loads((CORPUS/'manifest.json').read_text()):
 file=(CORPUS/item['name']).resolve(); folder=OUT/item['name'];folder.mkdir(exist_ok=True)
 before=baseline(file,folder)
 start=time.monotonic()
 fid=json.loads(api('POST','/files',file.read_bytes()))['id']
 job=json.loads(api('POST','/jobs',json.dumps({'fileId':fid,'strategy':'auto'}).encode()))
 while job['status'] not in ['completed','partial','failed','cancelled','interrupted']:
  if time.monotonic()-start>120: api('POST','/jobs/'+job['id']+'/cancel');break
  time.sleep(.1);job=json.loads(api('GET','/jobs/'+job['id']))
 job=json.loads(api('GET','/jobs/'+job['id']))
 (folder/'job.json').write_text(json.dumps(job,indent=2))
 if job['status'] in ['completed','partial']:
  (folder/job['outputName']).write_bytes(api('GET','/jobs/'+job['id']+'/output'))
 record={**item,'before':before,'afterStatus':job['status'],'afterValidation':job.get('report',{}).get('validation'),'duration':job.get('report',{}).get('duration'),'summary':job.get('report',{}).get('summary',job.get('error')),'warnings':job.get('report',{}).get('warnings',[]),'outputSize':job.get('outputSize'),'repairSeconds':round(time.monotonic()-start,3),'inputUnchanged':hashlib.sha256(file.read_bytes()).hexdigest()==item['sha256']}
 if job.get('outputName'):
  after_folder=folder/'independent-after';after_folder.mkdir(exist_ok=True)
  record['independentAfterDecode']=baseline((folder/job['outputName']).resolve(),after_folder)
 results.append(record); print(json.dumps(record),flush=True)
 (OUT/'results.json').write_text(json.dumps(results,indent=2)+'\n')
