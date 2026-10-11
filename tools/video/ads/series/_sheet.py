import subprocess,glob,sys
fs=sorted(glob.glob('still-*.jpg'),key=lambda f:float(f[6:-4]))
n=len(fs);cols=5;rows=(n+cols-1)//cols
inp=[];fl=[]
for i,f in enumerate(fs): inp+=['-i',f];fl.append(f'[{i}]scale=270:480[v{i}]')
for i in range(n,rows*cols): fl.append(f'color=black:270x480:d=1[v{i}]')
for r in range(rows): fl.append(''.join(f'[v{r*cols+c}]' for c in range(cols))+f'hstack={cols}[r{r}]')
fl.append(''.join(f'[r{r}]' for r in range(rows))+(f'vstack={rows}' if rows>1 else 'null'))
subprocess.check_call(['ffmpeg','-v','error','-y',*inp,'-filter_complex',';'.join(fl),'-frames:v','1','sheet.jpg'])
