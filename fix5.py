c=open('index.html','r',encoding='utf-8').read()
lines=c.split('\n')
# Remove lines 2205-2209 (index 2204-2208) which are leftover old code
print('Before:',len(lines),'lines')
print('Removing:',lines[2205:2210])
del lines[2205:2210]
print('After:',len(lines),'lines')
open('index.html','w',encoding='utf-8').write('\n'.join(lines))
print('Done')
