uniform float size;
uniform float zMin;
uniform float zMax;
uniform float timeStart; // seconds
uniform float timeDelta; // seconds
uniform vec3 lidarOrigin;
uniform float lidarSpeed; // meters per secont
uniform float decayTime;  // seconds

varying vec4 v_heightColor;

void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(size, size / gl_Position.w);

  float p = (position.z - zMin) / (zMax - zMin);
  highp float height = p * 16581375.0;
  int h = int(height);
  if(h < 0) {
    h = 0;
  }
  int bi = (h / 65536);
  int gi = (h - bi * 65536) / 256;
  int ri = (h - bi * 65536 - gi * 256);
  float r = float(ri) / 256.0;
  float g = float(gi) / 256.0;
  float b = float(bi) / 256.0;
  //v_heightColor = vec3(r, g, b);
  vec3 color = vec3(p, 0.5 * p, 1.0 - p);

  float distance = distance(lidarOrigin, position);
  float arrivalTime = timeStart + distance / lidarSpeed;
  float alpha = 1.0 - (timeDelta - arrivalTime) / decayTime;
  if(timeDelta < arrivalTime) {
    alpha = 0.0;
  }
  v_heightColor = vec4(color, alpha);
}