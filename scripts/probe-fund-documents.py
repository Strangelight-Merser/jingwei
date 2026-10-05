"""Free official-document probe. Archives public bodies; never edits the active content store."""
from pathlib import Path
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse
import concurrent.futures, hashlib, json, re, subprocess
import requests
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'evidence/fund-document-bodies-20261005';OUT.mkdir(exist_ok=True)
pack=json.loads((ROOT/'evidence/fund-research-integration-20261005/待发_冻结事实包.json').read_text())
docs=pack['snapshot']['documents'];chosen=[]
for code in ['007339','005658']:
 for kind in ['中期报告','资料概要']:
  candidates=[d for d in docs if d['code']==code and kind in d['title'] and ('2026' in d['title'] or d['published_at'].startswith('2026'))]
  if candidates:chosen.append(sorted(candidates,key=lambda d:d['published_at'],reverse=True)[0])
class Links(HTMLParser):
 def __init__(self):super().__init__();self.links=[]
 def handle_starttag(self,tag,attrs):
  if tag in ['a','iframe','embed','object']:
   d=dict(attrs)
   for key in ['href','src','data']:
    if d.get(key):self.links.append(d[key])
def allowed(url):
 h=urlparse(url).hostname or ''
 return urlparse(url).scheme=='https' and (h=='efunds.com.cn' or h.endswith('.efunds.com.cn') or h=='chinaamc.com' or h.endswith('.chinaamc.com'))
def download(url):
 if not allowed(url):raise ValueError('outside_official_vendor_host')
 r=requests.get(url,timeout=(8,25),headers={'User-Agent':'Mozilla/5.0 JingweiResearch/0.1'},allow_redirects=True)
 r.raise_for_status()
 if not allowed(r.url):raise ValueError('unexpected_redirect')
 data=r.content
 if len(data)>20*1024*1024:raise ValueError('public_document_too_large')
 digest=hashlib.sha256(data).hexdigest();pdf=data.startswith(b'%PDF-');path=OUT/(digest+('.pdf' if pdf else '.html'));path.write_bytes(data)
 return r,data,path,digest,pdf
def probe(doc):
 result={k:doc[k] for k in ['code','title','url','published_at']};result['checked_at']=datetime.now(timezone.utc).isoformat();result['downloads']=[]
 try:
  r,data,path,digest,pdf=download(doc['url']);result['downloads'].append({'url':doc['url'],'final_url':r.url,'http':r.status_code,'bytes':len(data),'sha256':digest,'file':path.name})
  if not pdf:
   text=data.decode('utf-8',errors='replace');parser=Links();parser.feed(text)
   pdfs=[urljoin(r.url,u) for u in parser.links if re.search(r'\.pdf(?:[?#]|$)',u,re.I)]
   result['pdf_links']=list(dict.fromkeys(pdfs))
   if not pdfs:raise ValueError('official_page_has_no_pdf_link')
   # Follow actual hrefs only. A page with several PDFs is not silently treated as one report.
   if len(set(pdfs))!=1:raise ValueError('multiple_pdf_links_need_identity_review')
   pdfurl=pdfs[0];r,data,path,digest,pdf=download(pdfurl);result['downloads'].append({'url':pdfurl,'final_url':r.url,'http':r.status_code,'bytes':len(data),'sha256':digest,'file':path.name})
  if not pdf:raise ValueError('response_is_not_pdf')
  output=OUT/(digest+'.txt');proc=subprocess.run(['pdftotext','-layout',str(path),str(output)],capture_output=True,text=True,timeout=25)
  if proc.returncode:raise ValueError('pdf_text_extraction_failed')
  body=output.read_text();pages=body.split('\f');result.update({'status':'body_extracted','pdf_file':path.name,'text_file':output.name,'pages':len(pages)-(1 if not pages[-1].strip() else 0),'characters':len(body),'body_sha256':hashlib.sha256(body.encode()).hexdigest()})
  if len(body.strip())<100:raise ValueError('pdf_requires_ocr')
  result['identity_excerpt']=body[:1600]
 except Exception as e:result.update({'status':'failed','error':str(e)})
 return result
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(probe,chosen))
manifest={'checked_at':datetime.now(timezone.utc).isoformat(),'scope':'Read official PDF bodies only. Active desktop, frozen request and credentials untouched.','documents':results}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(json.dumps([{k:r[k] for k in ['code','title','status','error','pages','characters','pdf_file','text_file','pdf_links'] if k in r} for r in results],ensure_ascii=False,indent=2))
