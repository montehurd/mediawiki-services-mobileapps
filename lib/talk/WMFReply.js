class WMFReply {
  constructor(replyData, doc) {
    this.text = replyData.text;
    this.depth = replyData.depth;
    this.sha = '';
  }
}

module.exports = {
  WMFReply
};
