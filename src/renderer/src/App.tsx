import React, { useEffect, useRef, useState } from 'react';

import _ from 'lodash';

import {
  Box,
  Button,
  ChakraProvider,
  DarkMode,
  extendTheme,
  Heading,
  HStack,
  Menu,
  MenuButton,
  MenuCommand,
  MenuItem,
  MenuList,
  Select,
  Slider,
  SliderFilledTrack,
  SliderMark,
  SliderThumb,
  SliderTrack,
  Text,
} from '@chakra-ui/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { DEFAULT_PANEL_WIDTH } from './constants';
import { setupThreeScene } from './scene';
import { useActionStore } from './stores/actionsStore';
import { usePlaybackStore } from './stores/playbackStore';
import { useSceneStore } from './stores/sceneStore';

const config = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
  fonts: {
    body: '-apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
  },
  fontSizes: {
    xs: '8px',
    sm: '10px',
    md: '12px',
    lg: '14px',
    xl: '16px',
    '2xl': '20px',
    '3xl': '24px',
    '4xl': '36px',
    '5xl': '48px',
    '6xl': '64px',
  },
};

const pandaScenes = _.range(1, 48).map((i) => _.padStart(i.toString(), 3, '0'));

const theme = extendTheme({ config });

function App(): JSX.Element {
  const [panelWidth] = useState<number>(DEFAULT_PANEL_WIDTH);
  const canvasContainer = useRef<HTMLDivElement>(null);
  const guiPanel = useRef<HTMLDivElement>(null);

  const { timestamp, setTimestamp, duration, playing, setPlaying } = usePlaybackStore();
  const { sceneName, setSceneName } = useSceneStore();
  const { record, screenshot } = useActionStore();

  useEffect(() => {
    if (canvasContainer.current && guiPanel.current) {
      const teardownPromise = setupThreeScene(canvasContainer.current, guiPanel.current);
      return async () => {
        const teardown = await teardownPromise;
        teardown();
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
            <Box
              flexGrow={1}
              borderTop="1px solid #333"
              display="flex"
              flexDirection="column"
              color="white"
            >
              <Box
                p={1}
                bgColor="gray.800"
                borderBottom="1px solid #333"
                display="flex"
                alignItems="center"
                justifyContent="space-between"
              >
                <Box>
                  <Select
                    size="xs"
                    placeholder="Select Scene"
                    onChange={(e) => setSceneName(e.target.value)}
                  >
                    {pandaScenes.map((name) => (
                      <option key={name} value={name}>
                        Pandaset {name}
                      </option>
                    ))}
                  </Select>
                </Box>
                <HStack spacing={0.5}>
                  <Button size="xs" onClick={() => setTimestamp(0.0)}>
                    <FontAwesomeIcon icon="backward-step" />
                  </Button>
                  {playing ? (
                    <Button size="xs" onClick={() => setPlaying(false)}>
                      <FontAwesomeIcon icon="pause" />
                    </Button>
                  ) : (
                    <Button
                      size="xs"
                      onClick={() => {
                        if (sceneName) {
                          setPlaying(true);
                        }
                      }}
                    >
                      <FontAwesomeIcon icon="play" />
                    </Button>
                  )}
                  <Button size="xs">
                    <FontAwesomeIcon icon="forward-step" />
                  </Button>
                </HStack>
                <Box fontSize={12}>
                  <Menu size="xs">
                    <MenuButton m={1}>
                      Render <FontAwesomeIcon size="xs" icon="chevron-down" />
                    </MenuButton>
                    <MenuList>
                      <MenuItem
                        onClick={() => {
                          if (screenshot) {
                            screenshot();
                          }
                        }}
                        disabled={!screenshot}
                      >
                        Take Screenshot
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          if (record) {
                            record();
                          }
                        }}
                        disabled={!record}
                      >
                        Record Video
                      </MenuItem>
                    </MenuList>
                  </Menu>
                </Box>
              </Box>
              {duration > 0 && (
                <Box>
                  <Slider
                    value={timestamp}
                    onChange={setTimestamp}
                    min={0}
                    max={duration}
                    step={0.01}
                    height={5}
                  >
                    <SliderTrack height={5} bg="gray.700">
                      <SliderFilledTrack bg="blue.500" />
                    </SliderTrack>
                    <SliderMark
                      height={5}
                      value={timestamp}
                      textAlign="center"
                      lineHeight={5}
                      fontSize={12}
                      fontWeight={700}
                      fontFamily="monospace"
                      color="white"
                      ml={timestamp < 0.5 ? 2 : -14}
                      mt={0}
                      w="12"
                    >
                      {timestamp.toFixed(3)}s
                    </SliderMark>
                  </Slider>
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      </DarkMode>
    </ChakraProvider>
  );
}

export default App;
