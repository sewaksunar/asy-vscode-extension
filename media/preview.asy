size(80,80);

// Eye shape
path tophalf = (-0.65,0)..(-0.3,0.45)..(0,0.5)..(0.3,0.45)..(0.65,0);
path bothalf = (0.65,0)..(0.3,-0.45)..(0,-0.5)..(-0.3,-0.45)..(-0.65,0);
path eye = tophalf -- bothalf -- cycle;
draw(eye, linewidth(4)+red);

// Iris
draw(circle((0,0),0.22), linewidth(4)+red);

// Pupil
fill(circle((0,0),0.09), red);