# Audio cues for the 15.8 s gameplay segment, timed to store/trailer-9x16.mp4 (gate ~10.3 s, Nova 13.4 s, King rises 15.0 s).
import json
c=[[0,"music","battle"],[60,"sfx","warning",0.5]]
c+= [[t,"sfx","shoot",0.45] for t in range(400,15800,650)]
c+= [[t,"sfx","kill",0.5] for t in range(900,15800,380)]
c+= [[t,"sfx","raise",0.6] for t in range(3300,9800,420)]
c+= [[10250,"sfx","gate_good",1.0],[13400,"sfx","nova",1.0],[13750,"sfx","soul_bomb",0.7],[14100,"sfx","explosion",0.6],[15000,"sfx","arena",1.0],[15050,"sfx","boss_roar",0.9]]
json.dump(sorted(c), open('cues_game.json','w'))
print(len(c),'cues')
