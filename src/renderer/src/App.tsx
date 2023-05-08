import React, { useEffect, useRef, useState } from 'react';

import { Box, Button, ChakraProvider, DarkMode, extendTheme, Text } from '@chakra-ui/react';

import { DEFAULT_PANEL_WIDTH } from './constants';
import { setupThreeScene } from './scene';
import { usePlaybackStore } from './stores/playbackStore';

const config = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
};

const theme = extendTheme({ config });

function App(): JSX.Element {
  const [panelWidth] = useState<number>(DEFAULT_PANEL_WIDTH);
  const canvasContainer = useRef<HTMLDivElement>(null);
  const guiPanel = useRef<HTMLDivElement>(null);

  const { timestamp, playing, setPlaying } = usePlaybackStore();

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
            <Box
              flexGrow={1}
              borderTop="1px solid #333"
              display="flex"
              flexDirection="column"
              color="white"
            >
              <Box
                height={10}
                borderBottom="1px solid #333"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                {playing ? (
                  <Button size="xs" onClick={() => setPlaying(false)}>
                    Pause
                  </Button>
                ) : (
                  <Button size="xs" onClick={() => setPlaying(true)}>
                    Play
                  </Button>
                )}
              </Box>
              <Box>
                <Text>Current timestamp: {(timestamp % 1000).toFixed(4)} seconds</Text>
              </Box>
            </Box>
          </Box>
        </Box>
      </DarkMode>
    </ChakraProvider>
  );
}

export default App;
