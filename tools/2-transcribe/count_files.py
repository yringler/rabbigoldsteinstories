import re, os, sys
t=open(r"C:\Users\ybrin\Downloads\creds.txt",encoding="utf-8").read()
os.environ["KAGGLE_API_TOKEN"]=re.search(r"KGAT_\w+",t).group(0)
from kaggle.api.kaggle_api_extended import KaggleApi
api=KaggleApi(); api.authenticate()
for ds in sys.argv[1:]:
    names=[]; tok=None
    while True:
        r=api.dataset_list_files(ds, page_token=tok, page_size=200)
        names+= [f.name for f in r.files]; tok=r.next_page_token
        if not tok: break
    print(ds, len(names), "files;", sum(n.endswith(".mp3") for n in names), "mp3;", "manifest.csv" in names)
