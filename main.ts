/**
 * SEO Assistant
 * An Obsidian plugin that generates SEO-friendly descriptions and keywords for markdown blog posts.
 * 
 * Features:
 * - Generates SEO-friendly descriptions and keywords in Chinese or English
 * - Supports custom prompts and API endpoints
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
    customPrompt: string;
}

const DEFAULT_SETTINGS: PluginSettings = {
    apiKey: '',
    apiUrl: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    maxTokens: 500,
    temperature: 0.8,
    language: 'zh',
    customPrompt: ''
}

const DEFAULT_PROMPTS = {
    zh: {
        system: "你是一个SEO专家。请为以下内容生成：\n1. 一段简洁、吸引人且对搜索引擎友好的中文描述（100-150字）\n2. 5-8个相关的中文关键词（用逗号分隔）\n\n请按照以下格式返回：\nDescription: [描述内容]\nKeywords: [关键词1, 关键词2, ...]",
        user: "内容：\n\n"
    },
    en: {
        system: "You are an SEO expert. Please generate:\n1. A concise, engaging, and SEO-friendly description in English (50-80 words)\n2. 5-8 relevant keywords (comma-separated)\n\nPlease respond in the following format:\nDescription: [description content]\nKeywords: [keyword1, keyword2, ...], IMPORTANT: please respond in English",
        user: "Content:\n\n"
    }
};

export default class SEOFriendlyDescriptionPlugin extends Plugin {
    settings: PluginSettings;

    async onload() {
        await this.loadSettings();

        this.addCommand({
            id: 'generate-seo-description',
            name: 'Generate Description and Keywords',
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
        const result = await this.callAIAPI(content);
        if (result) {
            this.updateFrontmatter(editor, result.description, result.keywords);
        }
    }

    async callAIAPI(content: string): Promise<{ description: string; keywords: string } | null> {
        try {
            const { system: defaultSystemPrompt, user: defaultUserPrompt } = 
                DEFAULT_PROMPTS[this.settings.language];

            const systemPrompt = this.settings.customPrompt || defaultSystemPrompt;

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

            const result = response.data.choices[0].message.content.trim();
            const descMatch = result.match(/Description:\s*([\s\S]*?)(?=\nKeywords:|$)/i);
            const keywordsMatch = result.match(/Keywords:\s*([\s\S]*?)$/i);

            if (!descMatch || !keywordsMatch) {
                throw new Error('Invalid response format from AI');
            }

            return {
                description: descMatch[1].trim(),
                keywords: keywordsMatch[1].trim()
            };

        } catch (error) {
            console.error('Error calling AI API:', error);
            new Notice('Failed to generate SEO content. Please check your API settings and try again.');
            return null;
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
            .setDesc('Enter your API key')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('API URL')
            .setDesc('The API endpoint URL (default is OpenAI, but you can use any compatible API)')
            .addText(text => text
                .setPlaceholder('https://api.openai.com/v1/chat/completions')
                .setValue(this.plugin.settings.apiUrl)
                .onChange(async (value) => {
                    this.plugin.settings.apiUrl = value;
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
            .setName('Custom Prompt')
            .setDesc('Optional: Provide your own prompt for generating SEO content. Leave empty to use the default prompt. The response should follow the format: "Description: [content] Keywords: [content]"')
            .addTextArea(text => text
                .setPlaceholder('Enter your custom prompt')
                .setValue(this.plugin.settings.customPrompt)
                .onChange(async (value) => {
                    this.plugin.settings.customPrompt = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Model')
            .setDesc('The model to use (e.g., gpt-3.5-turbo)')
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
                .setPlaceholder('500')
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