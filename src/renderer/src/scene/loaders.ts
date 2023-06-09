import _ from 'lodash';
import * as THREE from 'three';

import FRAGMENT_SHADER from './shaders/fragment.glsl';
import VERTEX_SHADER from './shaders/vertex.glsl';

export interface GpsPosition {
  lat: number;
  long: number;
  height: number;
  xvel: number;
  yvel: number;
}

export interface WorldPosition extends GpsPosition {
  world: THREE.Vector3;
}

export interface CameraPose {
  position: THREE.Vector3;
  heading: THREE.Quaternion;
}

export interface PandaScene {
  name: string;
  frames: THREE.Group;
  poses: CameraPose[];
  timestamps: number[];
  duration: number;
}

export async function loadJsonUrl<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const json = await response.json();
  return json;
}

export async function loadGpsPositions(url: string): Promise<WorldPosition[]> {
  const positions = await loadJsonUrl<GpsPosition[]>(url);
  const latlongToMeters = 111139;
  const positionZero = positions[0];
  const worldPositions = positions.map((position) => ({
    ...position,
    world: new THREE.Vector3(
      (position.lat - positionZero.lat) * latlongToMeters,
      (position.long - positionZero.long) * latlongToMeters,
      position.height - positionZero.height,
    ),
  }));
  return worldPositions;
}

export async function loadCameraPositions(url: string): Promise<CameraPose[]> {
  const poses = await loadJsonUrl<CameraPose[]>(url);
  return poses.map((pose) => ({
    position: new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z),
    heading: new THREE.Quaternion(pose.heading.x, pose.heading.y, pose.heading.z, pose.heading.w),
  }));
}

export async function loadLidarFrames({
  scene,
  timestamps,
  positions,
}: {
  scene: string;
  timestamps: number[];
  positions: THREE.Vector3[];
}): Promise<THREE.Group> {
  const frameBaseUrl = `http://localhost:8080/pandaset_0/${scene}`;
  const frameNumbers = timestamps.map((_, n) => String(n).padStart(2, '0'));
  const group = new THREE.Group();
  for (const [frameNumber, timestamp, position] of _.zip(frameNumbers, timestamps, positions)) {
    if (!timestamp || !position) {
      continue;
    }
    const timestampZero = timestamps[0];
    const deltaPosition = position;
    const url = frameBaseUrl + `/lidar_bin/${frameNumber}.bin`;
    const annotationsUrl = frameBaseUrl + `/annotations_bin/semseg/${frameNumber}.bin`;
    const frame = await loadFrame({
      url,
      annotationsUrl,
      timestamp: timestamp - timestampZero,
      origin: deltaPosition,
    });
    group.add(frame);
  }
  return group;
}

const numClasses = 256;
const colorMap = new Uint8Array(4 * numClasses);

export function createColorMapTexture() {
  const width = 256;
  const height = 1;

  const color = new THREE.Color(0x444444);

  const r = Math.floor(color.r * 255);
  const g = Math.floor(color.g * 255);
  const b = Math.floor(color.b * 255);

  for (let i = 0; i < numClasses; i++) {
    const stride = i * 4;
    colorMap[stride] = r;
    colorMap[stride + 1] = g;
    colorMap[stride + 2] = b;
    colorMap[stride + 3] = 255;
  }

  // used the buffer to create a DataTexture
  const texture = new THREE.DataTexture(colorMap, width, height);
  texture.needsUpdate = true;
  return texture;
}

export const colorMapTexture = createColorMapTexture();

export function updateColorMap(mapping: number[]) {
  for (let i = 0; i < numClasses; i++) {
    const stride = i * 4;
    colorMap[stride + 3] = mapping[i];
  }
  colorMapTexture.needsUpdate = true;
}

export async function loadFrame({
  url,
  annotationsUrl,
  timestamp,
  origin,
}: {
  url: string;
  annotationsUrl: string;
  timestamp: number;
  origin: THREE.Vector3;
}): Promise<THREE.Object3D> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const segmentsResponse = await fetch(annotationsUrl);
  const segmentBuffer =
    segmentsResponse.status === 200 ? await segmentsResponse.arrayBuffer() : null;

  const vertices = new Float32Array(buffer);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  if (segmentBuffer) {
    const segments = new Int32Array(segmentBuffer);
    geometry.setAttribute('segment', new THREE.BufferAttribute(segments, 1));
  } else {
    const segments = new Int32Array(vertices.length / 3);
    geometry.setAttribute('segment', new THREE.BufferAttribute(segments, 1));
  }
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      size: { value: 4.0 },
      zMin: { value: -1.0 },
      zRange: { value: 2.0 },
      timeStart: { value: timestamp },
      timeDelta: { value: 0.0 },
      lidarOrigin: { value: origin },
      lidarSpeed: { value: 120.0 },
      decayTime: { value: 0.15 },
      colorMap: { value: colorMapTexture },
    },
    transparent: true,
  });
  const mesh = new THREE.Points(geometry, material);
  return mesh;
}
