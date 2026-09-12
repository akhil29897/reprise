from pathlib import Path
import urllib.request, json, hashlib, concurrent.futures
root=Path(__file__).parent/'corpus'; root.mkdir(exist_ok=True)
paths=['mov/broken-movs/apple_cv.mov','mov/broken-movs/ctk_cpro.mov','avi/bad-index/Mansha.avi','avi/bad-index/broken_index1.avi','A-codecs/wavpcm/eof_garbage.wav','A-codecs/MP3/broken-first-frame.mp3']
def fetch(path):
 url='https://samples.ffmpeg.org/'+path; target=root/Path(path).name
 with urllib.request.urlopen(url,timeout=60) as response, target.open('wb') as out:
  n=0
  while chunk:=response.read(65536):
   n+=len(chunk)
   if n>32*1024*1024: raise ValueError('Download cap exceeded')
   out.write(chunk)
 result={'name':target.name,'url':url,'size':n,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'downloadedAt':'2026-09-12'}
 print(result,flush=True);return result
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(fetch,paths))
(root/'manifest.json').write_text(json.dumps(results,indent=2)+'\n')
