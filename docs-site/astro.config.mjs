// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://docs.elote.baby',
	trailingSlash: 'never',
	build: { format: 'file' },
	integrations: [
		starlight({
			title: 'elote.baby docs',
			description:
				'elote.baby is a credit pool demo on Solana devnet with test assets: investors deposit for shares, credit lines are opened from the pool, and repaid interest raises the value of every share. Not an offer of securities.',
			components: { Footer: './src/components/Footer.astro' },
			logo: { src: './src/assets/corn-icon.png', alt: 'elote.baby' },
			favicon: '/favicon.ico',
			head: [
				{ tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' } },
				{ tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' } },
				{ tag: 'meta', attrs: { name: 'theme-color', content: '#131313' } },
			],
			customCss: ['./src/styles/brand.css'],
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/soft-law/elote-baby' }],
			lastUpdated: true,
			// Explicit order: the pages read as a path, from what the pool is to how to run it.
			sidebar: [
				{
					label: 'Start here',
					items: [
						{ slug: 'index', label: 'Overview' },
						{ slug: 'how-the-pool-works' },
						{ slug: 'credit-lines' },
					],
				},
				{
					label: 'Guides',
					items: [{ slug: 'guides/investors' }, { slug: 'guides/borrowers' }, { slug: 'guides/loan-contracts' }],
				},
				{
					label: 'Reference',
					items: [
						{ slug: 'reference/program' },
						{ slug: 'reference/addresses' },
						{ slug: 'reference/run-it-yourself' },
						{ slug: 'reference/roadmap' },
					],
				},
			],
		}),
	],
});
