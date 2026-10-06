declare module 'react-native-vector-icons/MaterialCommunityIcons' {
  import { Component } from 'react';
  import { TextProps } from 'react-native';

  export interface IconProps extends TextProps {
    /** Glyph name from the MaterialCommunityIcons set, e.g. 'home-variant' */
    name: string;
    size?: number;
    color?: string;
  }

  export default class Icon extends Component<IconProps> {}
}
