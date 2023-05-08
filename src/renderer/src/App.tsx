import { useEffect, useRef, useState } from 'react';

import { GUI } from 'dat.gui';
import _ from 'lodash';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import { Box, Button, ChakraProvider, DarkMode, extendTheme, Text } from '@chakra-ui/react';

import FRAGMENT_SHADER from './shaders/fragment.glsl';
import VERTEX_SHADER from './shaders/vertex.glsl';

const DEFAULT_PANEL_WIDTH = 240;
const VIDEO_ASPECT_RATIO = 16 / 9;

interface GpsPosition {
  lat: number;
  long: number;
  height: number;
  xvel: number;
  yvel: number;
}

interface WorldPosition extends GpsPosition {
  world: THREE.Vector3;
}

async function loadJsonUrl<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const json = await response.json();
  return json;
}

async function loadPositions(url: string, timestamps: number[]): Promise<WorldPosition[]> {
  const positions = await loadJsonUrl<GpsPosition[]>(url);
  /*
  const lastPosition = new THREE.Vector2(0, 0);
  const worldPositions: WorldPosition[] = [];
  for (let ii = 0; ii < positions.length; ii++) {
    const position = positions[ii];
    const world = new THREE.Vector3(lastPosition.x, lastPosition.y, position.height);
    worldPositions.push({
      ...position,
      world,
    });
    if (ii < positions.length - 1) {
      const dtime = timestamps[ii + 1] - timestamps[ii];
      lastPosition.x += position.xvel * dtime;
      lastPosition.y += position.yvel * dtime;
    }
  }
  */
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

async function loadLidarFrames({
  scene,
  timestamps,
  positions,
}: {
  scene: string;
  timestamps: number[];
  positions: WorldPosition[];
}): Promise<THREE.Group> {
  const frameBaseUrl = `http://localhost:8080/pandaset_0/${scene}`;
  const frameNumbers = timestamps.map((_, n) => String(n).padStart(2, '0'));
  const group = new THREE.Group();
  for (const [frameNumber, timestamp, position] of _.zip(frameNumbers, timestamps, positions)) {
    if (!timestamp || !position) {
      continue;
    }
    const timestampZero = timestamps[0];
    const deltaPosition = position.world;
    const url = frameBaseUrl + `/lidar_bin/${frameNumber}.bin`;
    const frame = await loadFrame({
      url,
      timestamp: timestamp - timestampZero,
      origin: deltaPosition,
    });
    group.add(frame);
  }
  return group;
}

async function loadFrame({
  url,
  timestamp,
  origin,
}: {
  url: string;
  timestamp: number;
  origin: THREE.Vector3;
}): Promise<THREE.Object3D> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const vertices = new Float32Array(buffer);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      size: { value: 4.0 },
      zMin: { value: -2.0 },
      zMax: { value: 5.0 },
      timeStart: { value: timestamp },
      timeDelta: { value: 0.0 },
      lidarOrigin: { value: origin },
      lidarSpeed: { value: 120.0 },
      decayTime: { value: 0.15 },
    },
    transparent: true,
  });
  const mesh = new THREE.Points(geometry, material);
  return mesh;
}

function getTrackPositionAt(
  timestamps: number[],
  positions: WorldPosition[],
  dt: number,
): THREE.Vector3 {
  for (let ii = 0; ii < timestamps.length - 1; ii++) {
    const t1 = timestamps[ii] - timestamps[0];
    const t2 = timestamps[ii + 1] - timestamps[0];
    if (t1 <= dt && dt < t2) {
      const p1 = positions[ii].world;
      const p2 = positions[ii + 1].world;
      const fraction = (dt - t1) / (t2 - t1);
      const position = new THREE.Vector3();
      position.lerpVectors(p1, p2, fraction);
      //return position;
      return p1;
    }
  }
  return positions[positions.length - 1].world;
}

async function setupThreeScene(
  container: HTMLDivElement,
  guiContainer: HTMLDivElement,
): Promise<() => void> {
  const width = window.innerWidth - DEFAULT_PANEL_WIDTH;
  const height = width / VIDEO_ASPECT_RATIO;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  camera.up.set(0, 0, 1);
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const lidarScene = '006';
  const frameBaseUrl = `http://localhost:8080/pandaset_0/${lidarScene}`;

  const timestamps = await loadJsonUrl<number[]>(frameBaseUrl + `/meta/timestamps.json`); // timestamps are in seconds
  const duration = timestamps[timestamps.length - 1] - timestamps[0];
  const positions = await loadPositions(frameBaseUrl + `/meta/gps.json`, timestamps);

  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube);

  camera.position.z = 20;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.object.up.set(0, 0, 1);
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };

  const frames = await loadLidarFrames({
    scene: lidarScene,
    timestamps,
    positions,
  });
  scene.add(frames);

  let animationPointer: number | null = null;

  const params = {
    timeScale: 1 / 12.0,
    followCar: false,
  };
  const shaderParams = {
    zMin: -2.0,
    zMax: 5.0,
    lidarSpeed: 120.0,
    decayTime: 0.15,
  };

  function animate(timeMs: number): void {
    animationPointer = requestAnimationFrame(animate);
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;
    renderer.render(scene, camera);
    const timeDelta = ((timeMs / 1000.0) * params.timeScale) % duration;
    for (const frame of frames.children) {
      frame.material.uniforms.timeDelta.value = timeDelta;
    }
    const carPosition = getTrackPositionAt(timestamps, positions, timeDelta);
    cube.position.set(carPosition.x, carPosition.y, carPosition.z);
    if (params.followCar) {
      camera.position.x = cube.position.x;
      camera.position.y = cube.position.y;
      camera.lookAt(cube.position);
    }
  }

  function updateUniforms(): void {
    for (const frame of frames.children) {
      frame.material.uniforms.zMin.value = shaderParams.zMin;
      frame.material.uniforms.zMax.value = shaderParams.zMax;
      frame.material.uniforms.lidarSpeed.value = shaderParams.lidarSpeed;
      frame.material.uniforms.decayTime.value = shaderParams.decayTime;
    }
  }
  updateUniforms();

  window.addEventListener('resize', () => {
    const width = window.innerWidth - DEFAULT_PANEL_WIDTH;
    const height = width / VIDEO_ASPECT_RATIO;
    renderer.setSize(width, height);
    camera.aspect = width / height;
  });

  const gui = new GUI({ autoPlace: false });
  gui.width = DEFAULT_PANEL_WIDTH;

  const cameraGui = gui.addFolder('Camera Options');
  cameraGui.add(params, 'timeScale', 0.0, 1.0, 0.01).name('Time Scale');
  cameraGui.add(params, 'followCar').name('Auto Follow Car');
  cameraGui.open();
  const shaderGui = gui.addFolder('Shader Options');
  shaderGui.add(shaderParams, 'zMin', -10.0, 10.0, 0.1).name('Z-Floor').onChange(updateUniforms);
  shaderGui.add(shaderParams, 'zMax', -10.0, 10.0, 0.1).name('Z-Ceiling').onChange(updateUniforms);
  shaderGui
    .add(shaderParams, 'lidarSpeed', 1.0, 200.0, 1.0)
    .name('Lidar Speed')
    .onChange(updateUniforms);
  shaderGui
    .add(shaderParams, 'decayTime', 0.0, 1.0, 0.01)
    .name('Decay Time (s)')
    .onChange(updateUniforms);
  shaderGui.open();
  guiContainer.appendChild(gui.domElement);

  animate(0.0);
  return () => {
    if (animationPointer) {
      cancelAnimationFrame(animationPointer);
    }
    guiContainer.removeChild(gui.domElement);
    container.removeChild(renderer.domElement);
    renderer.dispose();
  };
}

const config = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
};

const theme = extendTheme({ config });

function App(): JSX.Element {
  const [panelWidth] = useState<number>(DEFAULT_PANEL_WIDTH);
  const canvasContainer = useRef<HTMLDivElement>(null);
  const guiPanel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (canvasContainer.current && guiPanel.current) {
      const teardownPromise = setupThreeScene(canvasContainer.current, guiPanel.current);
      return async () => {
        const teardownFn = await teardownPromise;
        teardownFn();
      };
    }
    return () => {};
  }, [canvasContainer, guiPanel]);

  return (
    <ChakraProvider theme={theme}>
      <DarkMode>
        <Box h="100vh" w="100vw" display="flex">
          <Box
            ref={guiPanel}
            w={panelWidth}
            display="flex"
            bg="gray.900"
            borderRight="1px solid #333"
            flexDirection="column"
          ></Box>
          <Box
            flexGrow={1}
            bgColor="gray.900"
            ref={canvasContainer}
            display="flex"
            flexDirection="column-reverse"
          >
            <Box flexGrow={1} borderTop="1px solid #333"></Box>
          </Box>
        </Box>
      </DarkMode>
    </ChakraProvider>
  );
}

export default App;
