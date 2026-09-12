import unittest, subprocess, tempfile, os, pathlib, time, json, urllib.request, urllib.error, hashlib, socket
ROOT=pathlib.Path(__file__).resolve().parents[1]
FF='/opt/homebrew/bin/ffmpeg' if pathlib.Path('/opt/homebrew/bin/ffmpeg').exists() else 'ffmpeg'
class Acceptance(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.tmp=tempfile.TemporaryDirectory(); cls.data=pathlib.Path(cls.tmp.name)
  cls.movie=cls.data/'donor.mp4'
  subprocess.run([FF,'-v','error','-f','lavfi','-i','testsrc2=size=128x96:rate=24','-f','lavfi','-i','sine=frequency=1000','-t','2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',str(cls.movie)],check=True)
  cls.proc=None
 def setUp(self):
  binary=ROOT/'target/debug/reprise-companion'
  self.assertTrue(binary.exists(),'Companion binary must exist')
  if self.__class__.proc is None:
   env=os.environ.copy(); env['REPRISE_TOKEN']='test-token-01234567890123456789'; env['REPRISE_UNTRUNC']=env.get('REPRISE_UNTRUNC',str(ROOT/'vendor/untrunc/untrunc'))
   self.__class__.proc=subprocess.Popen([str(binary),'--data-dir',str(self.data/'jobs'),'--max-upload','1048576'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
   for _ in range(100):
    try:
     if self.__class__.proc.poll() is not None: raise RuntimeError('Test companion stopped; port 47831 may already be in use')
     if self.req('GET','/health')[0]==200: break
    except Exception: time.sleep(.05)
 @classmethod
 def tearDownClass(cls):
  if cls.proc: cls.proc.terminate(); cls.proc.wait(timeout=10); cls.proc.stderr.close()
  cls.tmp.cleanup()
 def req(self,method,path,body=None,headers=None):
  h={'Authorization':'Bearer test-token-01234567890123456789'}; h.update(headers or {})
  r=urllib.request.Request('http://127.0.0.1:47831/v1'+path,data=body,headers=h,method=method)
  try:
   with urllib.request.urlopen(r,timeout=15) as f: return f.status,f.read(),dict(f.headers)
  except urllib.error.HTTPError as e: return e.code,e.read(),dict(e.headers)
 def upload(self,data,name='clip.mp4'):
  status,body,_=self.req('POST','/files',data,{'X-Filename':name}); self.assertEqual(status,201,body); return json.loads(body)['id']
 def job(self,f,strategy='auto',ref=None):
  body={'fileId':f,'strategy':strategy}
  if ref: body['referenceId']=ref
  status,raw,_=self.req('POST','/jobs',json.dumps(body).encode()); self.assertEqual(status,202,raw); j=json.loads(raw)
  for _ in range(300):
   j=json.loads(self.req('GET','/jobs/'+j['id'])[1])
   if j['status'] in ['completed','partial','failed','cancelled','interrupted']: return j
   time.sleep(.05)
  self.fail('Job failed to terminate')
 def test_security(self):
  self.assertEqual(self.req('GET','/health',headers={'Authorization':''})[0],401)
  self.assertEqual(self.req('GET','/health',headers={'Origin':'https://akhil29897.github.io'})[0],200)
  self.assertEqual(self.req('GET','/health',headers={'Origin':'https://evil.example'})[0],403)
  self.assertEqual(self.req('GET','/health',headers={'Host':'evil.example'})[0],403)
  self.assertEqual(self.req('GET','/health?token=abc')[0],400)
  self.assertEqual(self.req('OPTIONS','/files',headers={'Origin':'http://localhost:4173','Authorization':''})[0],204)
  self.assertEqual(self.req('POST','/files',b'x'*1048577)[0],413)
  for body in [{'fileId':'../../etc/passwd','strategy':'auto'},{'fileId':'x','strategy':'wrong'},{'fileId':'x','strategy':'reference'}]:
   self.assertIn(self.req('POST','/jobs',json.dumps(body).encode())[0],[400,404])
 def test_remux_and_immutable(self):
  original=self.movie.read_bytes(); fid=self.upload(original); j=self.job(fid,'remux')
  self.assertEqual(j['status'],'completed',j)
  self.assertTrue(j['report']['validation']['fullDecode']); self.assertEqual(len(j['report']['streams']),2)
  self.assertEqual(j['report']['inputSha256'],hashlib.sha256(original).hexdigest())
  self.assertEqual((self.data/'jobs'/'files'/fid/'input').read_bytes(),original)
  code,output,_=self.req('GET','/jobs/'+j['id']+'/output'); self.assertEqual(code,200); self.assertGreater(len(output),1000)
  self.assertEqual(hashlib.sha256(output).hexdigest(),j['report']['outputSha256'])
 def test_garbage_and_network_playlist(self):
  for content in [b'',b'not media',b'#EXTM3U\n#EXTINF:2,\nhttp://127.0.0.1:9/private.ts\n']:
   j=self.job(self.upload(content)); self.assertEqual(j['status'],'failed',j)
   self.assertNotEqual(self.req('GET','/jobs/'+j['id']+'/output')[0],200)
 def test_encoded_packets_without_decodable_media_are_not_recovery(self):
  raw=bytearray(self.movie.read_bytes()); pos=0
  while pos+8<=len(raw):
   size=int.from_bytes(raw[pos:pos+4],'big')
   if size<8: break
   if raw[pos+4:pos+8]==b'mdat': raw[pos+8:pos+size]=bytes(size-8)
   pos+=size
  j=self.job(self.upload(bytes(raw)))
  self.assertEqual(j['status'],'failed',j)
  self.assertNotEqual(self.req('GET','/jobs/'+j['id']+'/output')[0],200)
 def test_avi_bframes_generate_missing_timestamps(self):
  file=self.data/'bframes.avi'
  subprocess.run([FF,'-v','error','-f','lavfi','-i','testsrc2=size=128x96:rate=25','-t','2','-c:v','mpeg4','-bf','2','-y',str(file)],check=True)
  j=self.job(self.upload(file.read_bytes(),'bframes.avi'))
  self.assertEqual(j['status'],'completed',j)
  self.assertGreaterEqual(j['report']['duration'],1.9)
 def test_reference_missing_moov(self):
  raw=self.movie.read_bytes(); pos=0; chunks=[]
  while pos+8<=len(raw):
   size=int.from_bytes(raw[pos:pos+4],'big'); kind=raw[pos+4:pos+8]
   if size<8: break
   if kind!=b'moov': chunks.append(raw[pos:pos+size])
   pos+=size
  j=self.job(self.upload(b''.join(chunks),'damaged.rsv'),'reference',self.upload(raw))
  self.assertIn(j['status'],['completed','partial'],j)
  self.assertEqual(j['report']['strategy'],'reference')
  if j['status']=='partial': self.assertGreater(j['report']['validation']['errorCount'],0)
  no_b=self.data/'no-b.mp4'
  subprocess.run([FF,'-v','error','-f','lavfi','-i','testsrc2=size=128x96:rate=24','-t','2','-c:v','libx264','-bf','0',str(no_b)],check=True)
  raw=no_b.read_bytes(); moov=raw.index(b'moov')-4
  j=self.job(self.upload(raw[:moov],'no-moov.rsv'),'reference',self.upload(raw))
  self.assertEqual(j['status'],'completed',j); self.assertTrue(j['report']['validation']['fullDecode'])
if __name__=='__main__': unittest.main(verbosity=2)
