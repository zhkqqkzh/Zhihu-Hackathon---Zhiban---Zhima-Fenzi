#!/usr/bin/env python3
"""修正 scf/zhiban-scf.zip 的路径分隔符，使其能被腾讯云 SCF（Linux）解压。

背景：Windows 上用 PowerShell ZipFile 打包会把条目名写成 node_modules\\xx，
SCF 在 Linux 上解压只认正斜杠，报 "Unzip codezip Failded / Zip file structure invalid"。
node_modules 不在磁盘（只存在于 zip 内），所以直接改写 zip 内条目名，内容字节不动。

用法：python scripts/fix-scf-zip.py
"""
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCF = os.path.join(ROOT, 'scf')
SRC = os.path.join(SCF, 'zhiban-scf.zip')
TMP = SRC + '.tmp'

count = 0
with zipfile.ZipFile(SRC, 'r') as zin, zipfile.ZipFile(TMP, 'w', zipfile.ZIP_DEFLATED) as zout:
    for info in zin.infolist():
        name = info.filename.replace('\\', '/')
        # 目录条目 / 空路径不需要，SCF 只要文件
        if info.is_dir() or name.endswith('/') or name == '':
            continue
        base = name.rsplit('/', 1)[-1]
        # scf_bootstrap 与 node_modules/.bin 下无扩展名的 shim 需可执行权限
        executable = name == 'scf_bootstrap' or ('/.bin/' in name and '.' not in base)
        zi = zipfile.ZipInfo(name, date_time=info.date_time)
        zi.compress_type = zipfile.ZIP_DEFLATED
        zi.external_attr = (0o100755 if executable else 0o100644) << 16
        zout.writestr(zi, zin.read(info))
        count += 1

os.replace(TMP, SRC)
print('fixed %d entries -> %s' % (count, SRC))