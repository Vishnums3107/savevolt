const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    blockList: [
      /.*[/\\]android[/\\]\.cxx[/\\].*/,
      /.*[/\\]android[/\\].*[/\\]\.cxx[/\\].*/,
      /.*[/\\]android[/\\].*[/\\]build[/\\].*/,
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
