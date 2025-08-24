import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError, NodeConnectionType } from 'n8n-workflow';

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
		// ✅ Use enum instead of string literals
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		properties: [
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				placeholder: 'e.g. data or file',
				description: 'Name of the binary property on each item to modify (e.g. "data")',
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
					{ name: 'Do Not Touch Filename', value: 'leave' },
					{ name: 'Smart Replace Extension', value: 'smart' },
					{ name: 'Force Replace/Append', value: 'force' },
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
				description: 'Whether to allow items without the binary property to pass through unchanged instead of throwing an error',
			

			},
		],
	};

	async execute(this: IExecuteFunctions) {
	const items = this.getInputData();
	const out: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const item = { ...items[i] };
		const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
		const newMimeType = this.getNodeParameter('newMimeType', i) as string;
		const updateExtension = this.getNodeParameter('updateExtension', i) as boolean;
		const newExtensionRaw = (this.getNodeParameter('newExtension', i) as string) || '';
		const filenameHandling = this.getNodeParameter('filenameHandling', i) as 'leave'|'smart'|'force';
		const skipMissing = this.getNodeParameter('skipMissing', i) as boolean;
		const newExtension = newExtensionRaw.replace(/^\./, '');

		const binary = item.binary?.[binaryPropertyName];
		if (!binary) {
			if (skipMissing) {
				out.push(item);
				continue;
			}
			throw new NodeOperationError(this.getNode(), `Item ${i} is missing binary property "${binaryPropertyName}".`);
		}

		// Determine new filename if we’re changing/adding an extension
		let nextFileName = binary.fileName ?? '';
		if (updateExtension) {
			if (!newExtension) {
				throw new NodeOperationError(this.getNode(), 'When "Also Update File Extension" is enabled, "New Extension" must be provided.');
			}
			const dotExt = `.${newExtension}`;
			if (filenameHandling === 'smart') {
				if (nextFileName && /\.[A-Za-z0-9]+$/.test(nextFileName)) {
					nextFileName = nextFileName.replace(/\.[A-Za-z0-9]+$/, dotExt);
				} else if (nextFileName) {
					nextFileName = nextFileName + dotExt;
				} else {
					nextFileName = `file${dotExt}`;
				}
			} else if (filenameHandling === 'force') {
				if (nextFileName) {
					nextFileName = nextFileName.replace(/\.[A-Za-z0-9]+$/, '').replace(/\.$/, '') + dotExt;
				} else {
					nextFileName = `file${dotExt}`;
				}
			}
		}

		// Read the original bytes and re-prepare with new metadata
		const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
		const prepared = await this.helpers.prepareBinaryData(
			buffer,
			updateExtension ? nextFileName || undefined : binary.fileName, // keep original name unless we changed it
			newMimeType || binary.mimeType, // set new mime type
		);

		// Preserve/override extra fields
		if (updateExtension && newExtension) prepared.fileExtension = newExtension;
		// keep other metadata you care about
		if (binary.fileSize) prepared.fileSize = binary.fileSize;
		if (binary.directory) prepared.directory = binary.directory;

		item.binary = item.binary ?? {};
		item.binary[binaryPropertyName] = prepared;

		out.push(item);
	}

	return this.prepareOutputData(out);
}

}
