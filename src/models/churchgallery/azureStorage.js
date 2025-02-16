const {BlobServiceClient} = require('@azure/storage-blob');
const {v4: uuidv4} =  require('uuid');


class AzureStorageService  {
    constructor(){
        this.blobServiceClient  = BlobServiceClient.froConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
        this.containerClient  = this.blobServiceClient.getContainerClient(process.env.AZURE_STORAGE_CONTAINER_NAME);
    }

    async uploadFile(file , content_type){
        const extension = file.originalname.split('.').pop();
        const blobName = `${contentType}/${uuidv4()}.${extension}`;  
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

            const options = {
                blobHTTPHeaders: {
                    blobContentType: file.mimetype
                }
            };

            await blockBlobClient.uploadData(file.buffer, options);
            return blockBlobClient.url;
      }

      
  async deleteFile(url) {
    const blobName = url.split('/').pop();
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.delete();
  }
}

module.exports = {
    AzureStorageService
};