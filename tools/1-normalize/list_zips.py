import zipfile, glob, os, json, sys
d = r"C:\Users\ybrin\Downloads"
out = []
for z in sorted(glob.glob(os.path.join(d, "*.zip"))):
    with zipfile.ZipFile(z) as zf:
        for i in zf.infolist():
            out.append(dict(zip=os.path.basename(z), name=i.filename, size=i.file_size, csize=i.compress_size, dir=i.is_dir(), flag=i.flag_bits, method=i.compress_type))
json.dump(out, open("zip_listing.json","w",encoding="utf-8"), ensure_ascii=False, indent=0)
print(len(out))
