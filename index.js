const core = require('@actions/core');
const github = require('@actions/github');
const showdown = require('showdown');
const jsDom = require('jsdom');
const {JSDOM} = jsDom;
const {_encode, _decode} = require('node-encoder');
const util = require('./util');

/**
 * Generates no config badges automatically.
 */
class GenerateBadges {
	constructor() {
		this.token = core.getInput('GITHUB_TOKEN');
		this.inputBadges = core.getInput('badges');
		this.badgeStyle = core.getInput('badge-style');

		this.octokit = github.getOctokit(this.token);
		this.repoInfo = github.context.repo;
		this.repoSha = github.context.sha;
		this.action = github.context.payload.action;
		this.mdParser = new showdown.Converter();
	}

	_addBadges(content) {
		const htmlContent = this.mdParser.makeHtml(content);
		const {window: {document}} = new JSDOM(htmlContent);

		const badges = util._getBadgeLinks(this.inputBadges, this.repoInfo, this.badgeStyle);

		const header = document.querySelector('h1:nth-child(1)');
		const newHeader = `<h1>${header.textContent} ${badges}</h1>`;

		const updatedReadme = htmlContent.replace(header.outerHTML, newHeader);
		const updatedReadmeMd = this.mdParser.makeMarkdown(updatedReadme, document);

		return updatedReadmeMd;
	}

	_getReadmeEndpoint() {
		return `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/readme`;
	}

	_getUpdateEndpint() {
		return `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/contents/README.md`;
	}

	async init() {
		try {
			if (this.action && this.action !== 'closed') {
				return;
			}

			const {data: {sha, content: preContent}} = await this.octokit.request(`GET ${this._getReadmeEndpoint()}`, {
				headers: {
					authorization: `token ${this.token}`
				}
			});

			const readmeContent = _decode(preContent);
			const updatedContent = this._addBadges(readmeContent);
			const encoded64Content = _encode(updatedContent);
			const blob = await this.octokit.git.createBlob({
				...this.repoInfo,
				content: encoded64Content,
				encoding: 'base64'
			});

			if (sha !== blob.data.sha) {
				await this.octokit.request(`PUT ${this._getUpdateEndpint()}`, {
					headers: {
						authorization: `token ${this.token}`
					},
					message: 'chore: add badges :unicorn:',
					content: encoded64Content,
					sha
				});
			}
		} catch (error) {
			core.setFailed(error);
		}
	}
}

const genBadges = new GenerateBadges();
(async () => {
	await genBadges.init();
})();
