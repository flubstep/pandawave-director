import { useEffect, useRef, useState } from 'react';

import { GUI } from 'dat.gui';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import { Box, ChakraProvider, DarkMode, extendTheme } from '@chakra-ui/react';

import { loadCameraPositions, loadJsonUrl, loadLidarFrames, PandaScene } from './utils/lidar';

const DEFAULT_PANEL_WIDTH = 240;
const VIDEO_ASPECT_RATIO = 16 / 9;

function getTrackPositionAt(
  timestamps: number[],
  positions: THREE.Vector3[],
  dt: number,
): THREE.Vector3 {
  for (let ii = 0; ii < timestamps.length - 1; ii++) {
    const t1 = timestamps[ii] - timestamps[0];
    const t2 = timestamps[ii + 1] - timestamps[0];
    if (t1 <= dt && dt < t2) {
      const p1 = positions[ii];
      const p2 = positions[ii + 1];
      const fraction = (dt - t1) / (t2 - t1);
      const position = new THREE.Vector3();
      position.lerpVectors(p1, p2, fraction);
      return position;
    }
  }
  return positions[positions.length - 1];
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

  let pandaScene: PandaScene | null = null;
  async function loadPandaScene(name: string): Promise<void> {
    if (pandaScene) {
      scene.remove(pandaScene.frames);
    }
    const frameBaseUrl = `http://localhost:8080/pandaset_0/${name}`;
    const timestamps = await loadJsonUrl<number[]>(frameBaseUrl + `/meta/timestamps.json`); // timestamps are in seconds
    const positions = await loadCameraPositions(frameBaseUrl + '/camera/front_camera/poses.json');
    const frames = await loadLidarFrames({
      scene: name,
      timestamps,
      positions,
    });
    scene.add(frames);
    pandaScene = {
      name,
      timestamps,
      positions,
      frames,
    };
  }
  async function unloadPandaScene(): Promise<void> {
    if (!pandaScene) {
      return;
    }
    scene.remove(pandaScene.frames);
    pandaScene = null;
  }
  await loadPandaScene('006');

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
    if (pandaScene) {
      const { frames, positions, timestamps } = pandaScene;
      const duration = timestamps[timestamps.length - 1] - timestamps[0];
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
  }

  function updateUniforms(): void {
    if (!pandaScene) {
      return;
    }
    const { frames } = pandaScene;
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

  const availableScenes: { [name: string]: () => Promise<void> } = {
    '001': () => loadPandaScene('001'),
    '002': () => loadPandaScene('002'),
    '003': () => loadPandaScene('003'),
    '004': () => loadPandaScene('004'),
    '005': () => loadPandaScene('005'),
    '006': () => loadPandaScene('006'),
  };
  const sceneGui = gui.addFolder('Load Scene');
  for (const name of Object.keys(availableScenes)) {
    sceneGui.add(availableScenes, name).name(`Pandaset Scene ${name}`);
  }
  sceneGui.open();

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
  gui.add({ stop: () => unloadPandaScene() }, 'stop').name('Stop Scene Playback');
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
