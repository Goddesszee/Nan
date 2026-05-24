import re

content = open('index.html', 'r', encoding='utf-8').read()

start = content.find('async function doSwap()')
end = content.find('async function initSwapUI()')

print('doSwap start:', start)
print('initSwapUI start:', end)

if start > 0 and end > 0:
    clean = open('swap_clean.js', 'r', encoding='utf-8').read()
    content = content[:start] + clean + content[end:]
    open('index.html', 'w', encoding='utf-8').write(content)
    print('Done!')
else:
    print('Not found')
