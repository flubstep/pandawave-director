varying vec4 v_heightColor;

void main() {
  if(v_heightColor.w == 0.0) {
    discard;
  }
  gl_FragColor = v_heightColor;
}