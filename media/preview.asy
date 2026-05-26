size(80,80);

// Rounded box
real r=0.2;
path box=(-1+r,-1)--(1-r,-1){right}..{up}(1,-1+r)--(1,1-r){up}..{left}(1-r,1)--(-1+r,1){left}..{down}(-1,1-r)--(-1,-1+r){down}..{right}(-1+r,-1)--cycle;
fill(box, white);
draw(box, linewidth(5)+black);

// Eye shape
path tophalf = (-0.65,0)..(-0.3,0.45)..(0,0.5)..(0.3,0.45)..(0.65,0);
path bothalf = (0.65,0)..(0.3,-0.45)..(0,-0.5)..(-0.3,-0.45)..(-0.65,0);
path eye = tophalf -- bothalf -- cycle;
draw(eye, linewidth(4)+black);

// Iris
draw(circle((0,0),0.22), linewidth(4)+black);

// Pupil
fill(circle((0,0),0.09), black);