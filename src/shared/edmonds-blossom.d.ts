declare module 'edmonds-blossom' {
  const blossom: (edges: [number, number, number][], maxCardinality?: boolean) => number[];
  export default blossom;
}
