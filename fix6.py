c=open('index.html','r',encoding='utf-8').read()
lines=c.split('\n')
print('Line 2205:',repr(lines[2204][-50:]))
print('Line 2206:',repr(lines[2205]))
del lines[2205]
open('index.html','w',encoding='utf-8').write('\n'.join(lines))
print('Done')
