c=open('index.html','r',encoding='utf-8').read()
lines=c.split('\n')
print('Removing lines 2230-2237:')
for i in range(2229,2237):
    print(i+1,repr(lines[i][:80]))
del lines[2229:2237]
open('index.html','w',encoding='utf-8').write('\n'.join(lines))
print('Done')
