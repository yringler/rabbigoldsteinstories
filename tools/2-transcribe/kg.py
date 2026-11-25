import re, os, subprocess, sys
t=open(r"C:\Users\ybrin\Downloads\creds.txt",encoding="utf-8").read()
kg=re.search(r"KGAT_\w+",t).group(0)
env=dict(os.environ, KAGGLE_API_TOKEN=kg, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
exe=os.path.join(os.path.dirname(sys.executable),"kaggle.exe")
r=subprocess.run([exe,*sys.argv[1:]],env=env,capture_output=True,text=True,encoding="utf-8",errors="replace")
print((r.stdout+r.stderr).replace(kg,"<KAGGLE_TOKEN>"))
