size(80,80);

pair A = (-0.58, 0.80);
pair B = (0.88,  0.00);
pair C = (-0.58,-0.80);
real r = 0.18;

// For CW polygon, inward normal = rotate(-90)*edge_direction
pair eAB=unit(B-A), eBC=unit(C-B), eCA=unit(A-C);
pair nAB=rotate(-90)*eAB, nBC=rotate(-90)*eBC, nCA=rotate(-90)*eCA;

// Arc center at each corner: intersect the two inward-offset edge lines
pair cA = intersectionpoint(
  (A+100*(-eAB)+r*nAB)--(B+100*eAB+r*nAB),
  (C+100*(-eCA)+r*nCA)--(A+100*eCA+r*nCA));
pair cB = intersectionpoint(
  (A+100*(-eAB)+r*nAB)--(B+100*eAB+r*nAB),
  (B+100*(-eBC)+r*nBC)--(C+100*eBC+r*nBC));
pair cC = intersectionpoint(
  (B+100*(-eBC)+r*nBC)--(C+100*eBC+r*nBC),
  (C+100*(-eCA)+r*nCA)--(A+100*eCA+r*nCA));

// Tangent points
pair tA1=cA+r*unit((A+100*(-eCA)+r*nCA - A)), tA2=cA+r*unit((A+r*nAB - cA));
// Simpler: tangent points = foot of perpendicular from center to each edge line
pair tA_CA = cA + r*(nCA)*(-1); // center - r*inward_normal = point on edge
pair tA_AB = cA - r*nAB;
pair tB_AB = cB - r*nAB;
pair tB_BC = cB - r*nBC;
pair tC_BC = cC - r*nBC;
pair tC_CA = cC - r*nCA;

real aA1=degrees(tA_CA-cA), aA2=degrees(tA_AB-cA);
real aB1=degrees(tB_AB-cB), aB2=degrees(tB_BC-cB);
real aC1=degrees(tC_BC-cC), aC2=degrees(tC_CA-cC);

path tri =
  arc(cA,r,aA1,aA2,CW) -- tA_AB -- tB_AB --
  arc(cB,r,aB1,aB2,CW) -- tB_BC -- tC_BC --
  arc(cC,r,aC1,aC2,CW) -- tC_CA -- tA_CA --
  cycle;

// Draw the outline with a red pen and a thickness of 4
draw(tri, red + linewidth(4));