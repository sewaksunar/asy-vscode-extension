size(80,100,IgnoreAspect);

picture logo(pair s=0, pen q)
{
  picture pic;
  pen p=linewidth(5)+q;
  real a=-0.25;
  real b=0.95;
  real y1=-2.5;
  real y2=-3y1/2;
  path A=(a,0){dir(10)}::{dir(89.5)}(0,y2);
  draw(pic,A,p);
  pair w=(0,0.5);
  draw(pic,intersectionpoint(A,w-1--w)--w,p);
  draw(pic,(0,y1)--(0,y2),p);
  return shift(s)*pic;
}

pair z=(-0.015,0.08);
for(int x=0; x < 10; ++x)
  add(logo(0.1*x*z,gray(0.04*x)));

add(logo(red));