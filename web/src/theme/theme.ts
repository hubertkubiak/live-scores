import { createTheme, type MantineColorsTuple } from '@mantine/core';

/** Light to dark; index 5 ≈ green-500, 7 ≈ green-700, 9 ≈ green-900 from tokens.css. */
const forest: MantineColorsTuple = [
  '#eef7f1',
  '#cfe6d6',
  '#a9d3b7',
  '#82bf97',
  '#5fa97a',
  '#3e8e5e',
  '#30734c',
  '#24573f',
  '#1c4834',
  '#163b2a',
];

export const theme = createTheme({
  primaryColor: 'forest',
  primaryShade: 7,
  colors: { forest },
  fontFamily: "'Inter', system-ui, sans-serif",
  headings: { fontFamily: "'Inter', system-ui, sans-serif" },
  // lg = 1024 px: the sidebar is fixed from here up (SPEC F10).
  breakpoints: { xs: '36em', sm: '48em', md: '62em', lg: '64em', xl: '88em' },
  defaultRadius: 'md',
});
