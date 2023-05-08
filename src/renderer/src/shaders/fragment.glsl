varying vec4 v_heightColor;

void main() {
  if(v_heightColor.a < 0.01) {
    discard;
  }
  gl_FragColor = v_heightColor;
}