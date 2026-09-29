import React from "react";

export default class FeatureGrid extends React.Component {
  render() {
    const {bg = "bg-off-white", heading, description, items, getAsset, buttonText} = this.props;
    return <div className={`${bg} pv4`}>
      <div className="ph3 mw7 center">
        <h2 className="f2 b lh-title mb2">{heading}</h2>
        <p className="mb4 mw6">{description}</p>

        <div className="flex-ns flex-wrap mhn2-ns mb3">
          {(items || []).map((item, i) => <div className="ph2-ns w-third-ns mb4" key={i}>
            <img src={item.get("image") && getAsset(item.get("image"))} alt="" className="center db mb3" style={{width: "200px"}}/>
            {item.get("title") && <h3 className="f4 b lh-title mb2">{item.get("title")}</h3>}
            <p>{item.get("text")}</p>
          </div>)}
        </div>

        {buttonText && <div className="tc">
          <a href="#" className="btn raise">{buttonText}</a>
        </div>}
      </div>
    </div>;
  }
}
