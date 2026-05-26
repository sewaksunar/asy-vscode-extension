size(80,80);

// Scale factor to reduce the eye size (55% of original size)
real eye_scale = 0.55;

// Eye shape (scaled down)
path tophalf = (-0.65,0)..(-0.3,0.45)..(0,0.5)..(0.3,0.45)..(0.65,0);
path bothalf = (0.65,0)..(0.3,-0.45)..(0,-0.5)..(-0.3,-0.45)..(-0.65,0);
path eye = scale(eye_scale) * (tophalf -- bothalf -- cycle);
draw(eye, linewidth(4)+red);

// Iris (scaled down)
draw(scale(eye_scale) * circle((0,0),0.22), linewidth(4)+red);

// Pupil (scaled down)
fill(scale(eye_scale) * circle((0,0),0.09), red);

// --- Heavily Emphasized Dropdown Chevron ---
// Positioned clearly in the bottom-right area
pair chevron_tip = (0.50, -0.8); 

// Massive size boost (total horizontal span of 0.80)
path chevron = (chevron_tip + (-0.40, 0.40)) -- chevron_tip -- (chevron_tip + (0.40, 0.40));

// Heavy visual weight (linewidth 9) with smooth, rounded caps and joins
draw(chevron, red + linewidth(9) + roundcap + roundjoin);