import {
	Briefcase,
	Github,
	GraduationCap,
	Linkedin,
	Mail,
	MapPin,
	Phone,
} from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

const CONTACT = {
	phone: "+55 (67) 99924-0524",
	phoneHref: "tel:+5567999240524",
	email: "wgmattia@gmail.com",
	linkedin: "linkedin.com/in/wgmattia",
	linkedinHref: "https://linkedin.com/in/wgmattia",
	github: "github.com/gabrielmattia",
	githubHref: "https://github.com/gabrielmattia",
	location: "Foz do Iguaçu, Paraná, Brazil",
};

const SKILL_GROUPS: { title: string; skills: string[] }[] = [
	{
		title: "Front-End",
		skills: [
			"React.js (Hooks, Context API, Performance Optimization)",
			"TypeScript",
			"JavaScript",
			"HTML",
			"CSS",
			"Sass/SCSS",
			"Tailwind CSS",
			"Styled-Components",
			"Material UI",
			"Responsive Web Design",
		],
	},
	{
		title: "Back-End",
		skills: [
			"Node.js",
			"Laravel Lumen",
			"RESTful API Integration",
			"WebSockets",
		],
	},
	{
		title: "Databases",
		skills: ["PostgreSQL"],
	},
	{
		title: "Languages",
		skills: ["TypeScript", "JavaScript", "Python", "Java", "C/C++"],
	},
	{
		title: "Testing",
		skills: ["Automated Testing", "Jest", "Cypress"],
	},
	{
		title: "Tools & DevOps",
		skills: [
			"Git",
			"GitHub",
			"Vite",
			"Docker",
			"GitHub Actions (CI/CD)",
			"Figma",
		],
	},
	{
		title: "Other",
		skills: [
			"Angular",
			"Web Application Development",
			"UI Development",
			"API Integration",
			"Cross-functional Collaboration",
			"Code Reviews",
		],
	},
];

const EXPERIENCE = [
	{
		role: "Front-End Developer",
		company: "Join Ads",
		period: "Current",
		bullets: [
			"Develop modern, responsive, high-performance user interfaces using React.js, TypeScript, Tailwind CSS, and Material UI, focusing on user experience, usability, and application performance.",
			"Collaborate closely with the back-end team to integrate REST APIs, optimize application workflows, and create scalable front-end solutions capable of handling large volumes of data and users.",
			"Build reusable interface components and performance-oriented features, taking part in code reviews and debugging while following good coding practices and maintaining clear communication with the team.",
		],
	},
	{
		role: "Full-Stack Developer",
		company: "Nymeria Desenvolvimento de Sistemas",
		period: "July 2023 – October 2024",
		bullets: [
			"Built and maintained web applications across the stack — Angular front-end interfaces and Node.js back-end services.",
			"Delivered new features and maintained existing systems, integrating with external services and REST APIs.",
			"Focused on code quality, performance, and maintainability, following best software development practices in a collaborative team environment.",
		],
	},
];

const PROJECTS = [
	{
		title: "PoP Modeler (Scientific Initiation Project)",
		description:
			"Web platform for business-process-of-process modeling, built with React.js and Laravel Lumen. Worked on front-end features, interface components, and integration with back-end services.",
		linkLabel: "popmodeler.ledes.net",
		linkHref: "https://popmodeler.ledes.net",
	},
	{
		title: "Collective Housing Debates (Extension Project)",
		description:
			"Website to promote architectural projects focused on collective housing.",
		linkLabel: "debateshabitacaocoletiva.ufms.br",
		linkHref: "https://debateshabitacaocoletiva.ufms.br",
	},
];

export default function Portfolio() {
	return (
		<div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-16">
			<header className="flex flex-col gap-4">
				<h1 className="text-5xl font-bold tracking-tight">
					Wellington Gabriel de Mattia
				</h1>
				<p className="text-lg text-muted-foreground">
					Full-Stack Developer ·{" "}
					<span className="font-medium text-foreground">React.js</span> ·{" "}
					<span className="font-medium text-foreground">TypeScript</span> ·{" "}
					<span className="font-medium text-foreground">Node.js</span> ·{" "}
					<span className="font-medium text-foreground">REST APIs</span> ·{" "}
					<span className="font-medium text-foreground">PostgreSQL</span>
				</p>
				<div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
					<span className="flex items-center gap-1.5">
						<MapPin className="size-4" />
						{CONTACT.location}
					</span>
					<a
						href={CONTACT.phoneHref}
						className="flex items-center gap-1.5 hover:text-primary"
					>
						<Phone className="size-4" />
						{CONTACT.phone}
					</a>
					<a
						href={`mailto:${CONTACT.email}`}
						className="flex items-center gap-1.5 hover:text-primary"
					>
						<Mail className="size-4" />
						{CONTACT.email}
					</a>
					<a
						href={CONTACT.linkedinHref}
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center gap-1.5 hover:text-primary"
					>
						<Linkedin className="size-4" />
						{CONTACT.linkedin}
					</a>
					<a
						href={CONTACT.githubHref}
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center gap-1.5 hover:text-primary"
					>
						<Github className="size-4" />
						{CONTACT.github}
					</a>
				</div>
			</header>

			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">Professional Summary</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground">
						Full-Stack Developer with experience building responsive and
						scalable web applications, working across the front-end with
						React.js, TypeScript, Angular, Tailwind CSS, and Material UI, and on
						the back-end with Node.js, Laravel Lumen, PostgreSQL, and REST API
						integrations. Bachelor's Degree in Computer Science from the Federal
						University of Mato Grosso do Sul — UFMS. Skilled in developing
						modern user interfaces, collaborating with back-end teams,
						optimizing application flows, and delivering clean, maintainable
						code focused on performance, usability, and user experience.
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">Technical Skills</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
						{SKILL_GROUPS.map((group) => (
							<div key={group.title} className="flex flex-col gap-2">
								<h3 className="text-sm font-semibold text-foreground">
									{group.title}
								</h3>
								<div className="flex flex-wrap gap-2">
									{group.skills.map((skill) => (
										<span
											key={skill}
											className="rounded-full border bg-secondary px-3 py-1 text-xs text-secondary-foreground"
										>
											{skill}
										</span>
									))}
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			<section className="flex flex-col gap-4">
				<h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
					<Briefcase className="size-6 text-primary" />
					Professional Experience
				</h2>
				<div className="flex flex-col gap-4">
					{EXPERIENCE.map((job) => (
						<Card key={`${job.company}-${job.role}`}>
							<CardHeader>
								<CardTitle className="text-xl">{job.role}</CardTitle>
								<CardDescription>
									{job.company} · {job.period}
								</CardDescription>
							</CardHeader>
							<CardContent>
								<ul className="flex flex-col gap-2">
									{job.bullets.map((bullet) => (
										<li
											key={bullet}
											className="list-disc pl-4 text-muted-foreground marker:text-primary"
										>
											{bullet}
										</li>
									))}
								</ul>
							</CardContent>
						</Card>
					))}
				</div>
			</section>

			<section className="flex flex-col gap-4">
				<h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
					<GraduationCap className="size-6 text-primary" />
					Education
				</h2>
				<Card>
					<CardHeader>
						<CardTitle className="text-xl">
							Bachelor's Degree in Computer Science
						</CardTitle>
						<CardDescription>
							Federal University of Mato Grosso do Sul — UFMS · 2023
						</CardDescription>
					</CardHeader>
				</Card>
			</section>

			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">
						Academic &amp; Project Experience
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex flex-col gap-4">
						{PROJECTS.map((project) => (
							<div key={project.title} className="flex flex-col gap-1">
								<h3 className="font-semibold text-foreground">
									{project.title}
								</h3>
								<p className="text-muted-foreground">{project.description}</p>
								<a
									href={project.linkHref}
									target="_blank"
									rel="noopener noreferrer"
									className="text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80"
								>
									{project.linkLabel}
								</a>
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
