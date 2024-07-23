import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import axios from 'axios';

interface PluginSettings {
    apiKey: string;
    apiUrl: string;
    model: string;
    maxTokens: number;
    temperature: number;
    useAzure: boolean;
    azureApiVersion: string;
    azureDeploymentName: string;
}

const DEFAULT_SETTINGS: PluginSettings = {
    apiKey: '',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-3.5-turbo',
    maxTokens: 150,
    temperature: 0.8,
    useAzure: false,
    azureApiVersion: '2023-05-15',
    azureDeploymentName: ''
}

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
        // 这里调用AI API生成描述
        const description = await this.callAIAPI(content);

        // 更新frontmatter
        this.updateFrontmatter(editor, description);
    }

    async callAIAPI(content: string): Promise<string> {
        try {
            let apiUrl = this.settings.apiUrl;
            let headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };
            let data: Record<string, any> = {
                messages: [
                    { role: "system", content: "你是一个SEO专家，请你草拟一个对SEO友好的description标签内容，要考虑关键字、突出博客的实用性、概括博客的主要内容、description值的长度、以及在符合博客内容的前提使用吸引人的词语帮助提高点击率，但是要避免一直使用“深入”等词语看起来显得很资深的词语，这会用用户反感，你只需要输出description的值，不要输出html标签，也不需要任何说明和解释" },
                    { role: "user", content: `请为如下内容生成SEO友好的description:\n\n${content}\n\n SEO Description:` }
                ],
                max_tokens: this.settings.maxTokens,
                temperature: this.settings.temperature,
            };

            if (this.settings.useAzure) {
                apiUrl += `openai/deployments/${this.settings.azureDeploymentName}/chat/completions?api-version=${this.settings.azureApiVersion}`;
                headers['api-key'] = this.settings.apiKey;
            } else {
                headers['Authorization'] = `Bearer ${this.settings.apiKey}`;
                data['model'] = this.settings.model;
            }

            const response = await axios.post(apiUrl, data, { headers });

            return response.data.choices[0].message.content.trim();
        } catch (error) {
            console.error('Error calling AI API:', error);
            new Notice('Failed to generate SEO description. Please check your API settings and try again.');
            return '';
        }
    }

    updateFrontmatter(editor: Editor, description: string) {
        const content = editor.getValue();
        const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
        const frontmatterMatch = content.match(frontmatterRegex);

        if (frontmatterMatch) {
            const frontmatter = frontmatterMatch[1];
            const updatedFrontmatter = frontmatter.includes('description:')
                ? frontmatter.replace(/description:.*/, `description: "${description}"`)
                : `${frontmatter}\ndescription: "${description}"`;

            editor.setValue(content.replace(frontmatterRegex, `---\n${updatedFrontmatter}\n---`));
        } else {
            editor.setValue(`---\ndescription: "${description}"\n---\n\n${content}`);
        }

        new Notice('SEO description generated and added to frontmatter.');
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
        containerEl.createEl('h2', { text: 'SEO-Friendly Description Generator Settings' });

        new Setting(containerEl)
            .setName('Use Azure OpenAI')
            .setDesc('Toggle to use Azure OpenAI instead of regular OpenAI')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useAzure)
                .onChange(async (value) => {
                    this.plugin.settings.useAzure = value;
                    await this.plugin.saveSettings();
                    this.display(); // Refresh the settings page
                }));

        new Setting(containerEl)
            .setName('API Key')
            .setDesc('Enter your AI API key')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('API URL')
            .setDesc('Enter the API endpoint URL')
            .addText(text => text
                .setPlaceholder(this.plugin.settings.useAzure ? 'https://<your-resource-name>.openai.azure.com/' : 'https://api.openai.com/v1/chat/completions')
                .setValue(this.plugin.settings.apiUrl)
                .onChange(async (value) => {
                    this.plugin.settings.apiUrl = value;
                    await this.plugin.saveSettings();
                }));

        if (this.plugin.settings.useAzure) {
            new Setting(containerEl)
                .setName('Azure API Version')
                .setDesc('Enter the Azure OpenAI API version')
                .addText(text => text
                    .setPlaceholder('2023-05-15')
                    .setValue(this.plugin.settings.azureApiVersion)
                    .onChange(async (value) => {
                        this.plugin.settings.azureApiVersion = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Azure Deployment Name')
                .setDesc('Enter your Azure OpenAI deployment name')
                .addText(text => text
                    .setPlaceholder('Enter deployment name')
                    .setValue(this.plugin.settings.azureDeploymentName)
                    .onChange(async (value) => {
                        this.plugin.settings.azureDeploymentName = value;
                        await this.plugin.saveSettings();
                    }));
        } else {
            new Setting(containerEl)
                .setName('Model')
                .setDesc('Enter the model name')
                .addText(text => text
                    .setPlaceholder('gpt-3.5-turbo')
                    .setValue(this.plugin.settings.model)
                    .onChange(async (value) => {
                        this.plugin.settings.model = value;
                        await this.plugin.saveSettings();
                    }));
        }

        new Setting(containerEl)
            .setName('Max Tokens')
            .setDesc('Maximum number of tokens to generate')
            .addText(text => text
                .setPlaceholder('60')
                .setValue(String(this.plugin.settings.maxTokens))
                .onChange(async (value) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue)) {
                        this.plugin.settings.maxTokens = numValue;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Temperature')
            .setDesc('Controls randomness (0.0-1.0)')
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