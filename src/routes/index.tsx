import { createFileRoute } from "@tanstack/react-router";
import LoveQuestion from "@/components/LoveQuestion";

export const Route = createFileRoute("/")({ component: App });

function App() {
	return <LoveQuestion />;
}
