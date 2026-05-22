import re
c=open('index.html','r',encoding='utf-8').read()
old=re.search(r'if\(isCircleWallet&&circleWalletId&&circleWalletAddress\)\{.*?return;\s*\}', c, re.DOTALL)
if old:
    print('Found at:', old.start(), 'to', old.end())
    print('Sample:', repr(c[old.start():old.start()+80]))
else:
    print('NOT FOUND')
