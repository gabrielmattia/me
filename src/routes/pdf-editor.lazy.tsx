import { createLazyFileRoute } from "@tanstack/react-router";
import { PdfEditor } from "@/components/pdf-editor/PdfEditor";

export const Route = createLazyFileRoute("/pdf-editor")({
	component: PdfEditor,
});
