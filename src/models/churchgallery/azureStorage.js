const { BlobServiceClient } = require("@azure/storage-blob");
const { v4: uuidv4 } = require("uuid");

class AzureStorageService {
  constructor() {
    // Fixed method name
    this.blobServiceClient = BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING
    );
    this.containerClient = this.blobServiceClient.getContainerClient(
      process.env.AZURE_STORAGE_CONTAINER
    );
  }

  async uploadFile(file, content_type) {
    // Parameter is content_type
    const extension = file.originalname.split(".").pop();
    // Using correct parameter name
    const blobName = `${content_type}/${uuidv4()}.${extension}`;
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

    const options = {
      blobHTTPHeaders: {
        blobContentType: file.mimetype,
      },
    };

    await blockBlobClient.uploadData(file.buffer, options);
    return blockBlobClient.url;
  }

  async deleteFile(url) {
    const blobName = url.split("/").pop();
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.delete();
  }
}

module.exports = { AzureStorageService };
