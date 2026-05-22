c=open('index.html','r',encoding='utf-8').read()
lines=c.split('\n')
# Insert missing closing brace before </script>
idx=next(i for i,l in enumerate(lines) if '</script>' in l)
print('Inserting } before line',idx+1)
lines.insert(idx,'}')
open('index.html','w',encoding='utf-8').write('\n'.join(lines))
print('Done')
