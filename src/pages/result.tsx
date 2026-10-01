export default function PreviousResultPage() { return null; }
export function getServerSideProps() { return { redirect: { destination: "/", permanent: true } }; }
