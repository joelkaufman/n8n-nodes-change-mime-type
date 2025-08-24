import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

export class ChangeMimeType implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Change MIME Type',
		name: 'changeMimeType',
		icon: 'fa:file',
		group: ['transform'],
		version: 1,
		description: 'Change the MIME type metadata of a binary file',
		defaults: {
			name: 'Change MIME Type',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				placeholder: 'e.g. data or file',
				description:
					'Name of the binary property on each item to modify (e.g. "data")',
				required: true,
			},
			{
				displayName: 'New MIME Type',
				name: 'newMimeType',
				type: 'string',
				default: 'application/pdf',
				placeholder: 'e.g. image/png, application/pdf, text/plain',
				required: true,
			},
			{
				displayName: 'Also Update File Extension',
				name: 'updateExtension',
				type: 'boolean',
				default: false,
			},
			{
				displayName: 'New Extension',
				name: 'newExtension',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						updateExtension: [true],
					},
				},
				placeholder: 'e.g. png, pdf, txt (without dot)',
				description: 'If set, updates binary.fileExtension and fileName extension',
			},
			{
				displayName: 'Filename Handling',
				name: 'filenameHandling',
				type: 'options',
				default: 'smart',
				options: [
					{
						name: 'Do Not Touch Filename',
						value: 'leave',
						description: 'Only change mimeType; keep fileName as-is',
					},
					{
						name: 'Smart Replace Extension',
						value: 'smart',
						description:
							'If fileName exists and has an extension, replace it; otherwise append one',
					},
					{
						name: 'Force Replace/Append',
						value: 'force',
						description:
							'Always replace/append extension on fileName if updateExtension is enabled',
					},
				],
				displayOptions: {
					show: {
						updateExtension: [true],
					},
				},
			},
			{
				displayName: 'Skip Missing Binary (Do Not Error)',
				name: 'skipMissing',
				type: 'boolean',
				default: false,
				description:
					"If enabled, items without the binary property won't throw; they'll pass through unchanged",
			},
		],
	};

	async execute(this: IExecuteFunctions) {
		const items = this.getInputData();
		const returnItems: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const item = { ...items[i] };
			const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
			const newMimeType = this.getNodeParameter('newMimeType', i) as string;
			const updateExtension = this.getNodeParameter('updateExtension', i) as boolean;
			const newExtensionRaw = (this.getNodeParameter('newExtension', i) as string) || '';
			const filenameHandling = this.getNodeParameter('filenameHandling', i) as
				| 'leave'
				| 'smart'
				| 'force';
			const skipMissing = this.getNodeParameter('skipMissing', i) as boolean;

			const newExtension = newExtensionRaw.replace(/^\./, ''); // strip leading dot if provided

			// Ensure binary exists
			const binary = item.binary?.[binaryPropertyName];
			if (!binary) {
				if (skipMissing) {
					returnItems.push(item);
					continue;
				}
				throw new NodeOperationError(
					this.getNode(),
					`Item ${i} is missing binary property "${binaryPropertyName}".`,
				);
			}

			// Clone binary object safely
			const cloned = this.helpers.cloneBinaryData(binary);

			// Update MIME type
			cloned.mimeType = newMimeType;

			// Optionally update extension metadata and filename
			if (updateExtension) {
				if (!newExtension) {
					throw new NodeOperationError(
						this.getNode(),
						'When "Also Update File Extension" is enabled, "New Extension" must be provided.',
					);
				}

				// Update binary.fileExtension
				cloned.fileExtension = newExtension;

				// Optionally update fileName
				if (filenameHandling !== 'leave') {
					const oldName = cloned.fileName || '';
					const dotExt = `.${newExtension}`;

					let base = oldName;
					if (filenameHandling === 'smart') {
						// Replace existing extension if any, else append
						if (oldName && /\.[A-Za-z0-9]+$/.test(oldName)) {
							base = oldName.replace(/\.[A-Za-z0-9]+$/, dotExt);
						} else if (oldName) {
							base = oldName + dotExt;
						} else {
							// No existing name: create a sensible default
							base = `file${dotExt}`;
						}
					} else {
						// force
						if (oldName) {
							base = oldName.replace(/\.[A-Za-z0-9]+$/, '');
							// remove trailing dot if we stripped a non-existent extension
							base = base.replace(/\.$/, '');
							base = base + dotExt;
						} else {
							base = `file${dotExt}`;
						}
					}
					cloned.fileName = base;
				}
			}

			// Write back
			item.binary = item.binary ?? {};
			item.binary[binaryPropertyName] = cloned;

			returnItems.push(item);
		}

		return this.prepareOutputData(returnItems);
	}
}
