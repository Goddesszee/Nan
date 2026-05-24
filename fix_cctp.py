content = open('index.html', 'r', encoding='utf-8').read()

old = """const DEST_TRANSMITTER={
              'ETH-SEPOLIA':'0x7865fAfC2db2093669d92c0197E5d0a401D7A8C4',
              'BASE-SEPOLIA':'0x7865fAfC2db2093669d92c0197E5d0a401D7A8C4',
              'ARB-SEPOLIA':'0x7865fAfC2db2093669d92c0197E5d0a401D7A8C4',
              'OP-SEPOLIA':'0x7865fAfC2db2093669d92c0197E5d0a401D7A8C4',
              'AVAX-FUJI':'0xa9fB1b3009DCb79E2fe346c16a604B8Fa8aE0a79',
              'POLYGON-AMOY':'0x7865fAfC2db2093669d92c0197E5d0a401D7A8C4',
            };"""

new = """const DEST_TRANSMITTER={
              'ETH-SEPOLIA':'0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
              'BASE-SEPOLIA':'0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
              'ARB-SEPOLIA':'0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
              'OP-SEPOLIA':'0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
              'AVAX-FUJI':'0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
              'POLYGON-AMOY':'0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
            };"""

if old in content:
    content = content.replace(old, new, 1)
    open('index.html', 'w', encoding='utf-8').write(content)
    print('Fixed! All destination transmitters updated to CCTP V2')
else:
    print('Pattern not found')
