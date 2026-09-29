import React from "react";

export default class ContactPreview extends React.Component {
  render() {
    const {entry, widgetFor} = this.props;
    return <div className="ph3 bg-off-white">
      <div className="center mw6 pv4">
        <h1 className="f2 b lh-title mb3">{ entry.getIn(["data", "title"]) }</h1>
        { widgetFor("body") }
      </div>
    </div>;
  }
}
