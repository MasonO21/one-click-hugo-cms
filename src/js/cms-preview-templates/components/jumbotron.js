import React from "react";

export default class Jumbotron extends React.Component {
  render() {
    const {image, title, subtitle, showForm} = this.props;
    return <div>
      <div className="pv5 pv6-l ph3 bg-center cover" style={{
        backgroundImage: image && `url(${image})`
      }}>
        <div className="mw7 center ph3">
          <h1 className="f2 f1-l b lh-title mb3 black mw6">{ title }</h1>
          {subtitle && <p className="f4 grey-4 mw6 mb4">{ subtitle }</p>}
          {showForm && <div className="mw6">
            <div className="flex-ns mb3">
              <div className="flex-auto mb2 mb0-ns mr2-ns">
                <input type="email" placeholder="Your email" className="w-100" readOnly />
              </div>
              <button className="btn btn-primary mb3 w-100 w-auto-ns mb0-ns raise" type="button">Join the waitlist</button>
            </div>
            <p className="f6 grey-3 mb0">We’ll send one email when it’s ready, and nothing else.</p>
          </div>}
        </div>
      </div>
    </div>;
  }
}
