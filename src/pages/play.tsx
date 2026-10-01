export default function PreviousPlayPage() { return null; }
export function getServerSideProps() { return { redirect: { destination: "/", permanent: true } }; }
