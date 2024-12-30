/**
 * SEO Friendly Description Generator
 * An Obsidian plugin that generates SEO-friendly descriptions and keywords for markdown blog posts.
 * 
 * Features:
 * - Generates SEO-friendly descriptions and keywords in Chinese or English
 * - Supports custom prompts for description and keyword generation
 * - Automatically updates frontmatter with generated content
 */

import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import axios from 'axios';

interface PluginSettings {
    apiKey: string;
    apiUrl: string;
    model: string;
    maxTokens: number;
    temperature: number;
    language: 'zh' | 'en';
    customDescriptionPrompt: string;
    customKeywordsPrompt: string;
    useCustomPrompts: boolean;
}

const DEFAULT_SETTINGS: PluginSettings = {
    apiKey: '',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-3.5-turbo',
    maxTokens: 150,
    temperature: 0.8,
    language: 'zh',
    customDescriptionPrompt: '',
    customKeywordsPrompt: '',
    useCustomPrompts: false
}

const DEFAULT_PROMPTS = {
    description: {
        zh: {
            system: "你是一个SEO专家，请生成一段简洁、吸引人且对搜索引擎友好的中文描述，长度在100-150字之间。",
            user: "请为以下内容生成描述：\n\n"
        },
        en: {
            system: "You are an SEO expert. Generate a concise, engaging, and SEO-friendly description in English, between 50-80 words.",
            user: "Generate a description for the following content:\n\n"
        }
    },
    keywords: {
        zh: {
            system: "你是一个SEO专家，请生成5-8个相关的中文关键词，用逗号分隔。关键词应该准确反映内容主题，并具有搜索价值。",
            user: "请为以下内容生成关键词：\n\n"
        },
        en: {
            system: "You are an SEO expert. Generate 5-8 relevant English keywords, separated by commas. Keywords should accurately reflect the content and have search value.",
            user: "Generate keywords for the following content:\n\n"
        }
    }
};

export default class SEOFriendlyDescriptionPlugin extends Plugin {
    settings: PluginSettings;

    async onload() {
        await this.loadSettings();

        this.addCommand({
            id: 'generate-seo-description',
            name: 'Generate SEO Description',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                this.generateDescription(editor, view);
            }
        });

        this.addSettingTab(new SEOSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async generateDescription(editor: Editor, view: MarkdownView) {
        const content = editor.getValue();
        const description = await this.callAIAPI(content, 'description');
        const keywords = await this.callAIAPI(content, 'keywords');

        if (description && keywords) {
            this.updateFrontmatter(editor, description, keywords);
        }
    }

    async callAIAPI(content: string, type: 'description' | 'keywords'): Promise<string> {
        try {
            const { system: defaultSystemPrompt, user: defaultUserPrompt } = 
                DEFAULT_PROMPTS[type][this.settings.language];

            const systemPrompt = this.settings.useCustomPrompts
                ? (type === 'description' ? this.settings.customDescriptionPrompt : this.settings.customKeywordsPrompt)
                : defaultSystemPrompt;

            const messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: defaultUserPrompt + content }
            ];

            const response = await axios.post(
                this.settings.apiUrl,
                {
                    model: this.settings.model,
                    messages: messages,
                    max_tokens: this.settings.maxTokens,
                    temperature: this.settings.temperature,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.settings.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return response.data.choices[0].message.content.trim();
        } catch (error) {
            console.error('Error calling AI API:', error);
            new Notice(`Failed to generate SEO ${type}. Please check your API settings and try again.`);
            return '';
        }
    }

    updateFrontmatter(editor: Editor, description: string, keywords: string) {
        const content = editor.getValue();
        const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
        const frontmatterMatch = content.match(frontmatterRegex);
    
        let newContent: string;
        if (frontmatterMatch) {
            let frontmatter = frontmatterMatch[1];
            frontmatter = this.updateFrontmatterField(frontmatter, 'description', description);
            frontmatter = this.updateFrontmatterField(frontmatter, 'keywords', keywords);
            newContent = content.replace(frontmatterRegex, `---\n${frontmatter}\n---`);
        } else {
            newContent = `---\ndescription: "${description}"\nkeywords: "${keywords}"\n---\n\n${content}`;
        }
    
        editor.setValue(newContent);
        new Notice('SEO description and keywords updated successfully!');
    }

    private updateFrontmatterField(frontmatter: string, field: string, value: string): string {
        const fieldRegex = new RegExp(`${field}:.*(\n|$)`);
        if (frontmatter.includes(`${field}:`)) {
            return frontmatter.replace(fieldRegex, `${field}: "${value}"`);
        }
        return `${frontmatter}\n${field}: "${value}"`;
    }
}

class SEOSettingTab extends PluginSettingTab {
    plugin: SEOFriendlyDescriptionPlugin;

    constructor(app: App, plugin: SEOFriendlyDescriptionPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('OpenAI API Key')
            .setDesc('Enter your OpenAI API key')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Language')
            .setDesc('Choose the output language for SEO content')
            .addDropdown(dropdown => dropdown
                .addOption('zh', '中文')
                .addOption('en', 'English')
                .setValue(this.plugin.settings.language)
                .onChange(async (value: 'zh' | 'en') => {
                    this.plugin.settings.language = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Use Custom Prompts')
            .setDesc('Enable to use custom prompts instead of default ones')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useCustomPrompts)
                .onChange(async (value) => {
                    this.plugin.settings.useCustomPrompts = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Custom Description Prompt')
            .setDesc('Custom system prompt for generating descriptions')
            .addTextArea(text => text
                .setPlaceholder('Enter your custom prompt for descriptions')
                .setValue(this.plugin.settings.customDescriptionPrompt)
                .onChange(async (value) => {
                    this.plugin.settings.customDescriptionPrompt = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Custom Keywords Prompt')
            .setDesc('Custom system prompt for generating keywords')
            .addTextArea(text => text
                .setPlaceholder('Enter your custom prompt for keywords')
                .setValue(this.plugin.settings.customKeywordsPrompt)
                .onChange(async (value) => {
                    this.plugin.settings.customKeywordsPrompt = value;
                    await this.plugin.saveSettings();
                }));

        // Advanced Settings
        containerEl.createEl('h3', { text: 'Advanced Settings' });

        new Setting(containerEl)
            .setName('Model')
            .setDesc('OpenAI model to use')
            .addText(text => text
                .setPlaceholder('gpt-3.5-turbo')
                .setValue(this.plugin.settings.model)
                .onChange(async (value) => {
                    this.plugin.settings.model = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Max Tokens')
            .setDesc('Maximum number of tokens in the response')
            .addText(text => text
                .setPlaceholder('150')
                .setValue(String(this.plugin.settings.maxTokens))
                .onChange(async (value) => {
                    const numValue = parseInt(value);
                    if (!isNaN(numValue)) {
                        this.plugin.settings.maxTokens = numValue;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Temperature')
            .setDesc('Controls randomness in the response (0-1)')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.1)
                .setValue(this.plugin.settings.temperature)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.temperature = value;
                    await this.plugin.saveSettings();
                }));
    }
}