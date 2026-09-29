import React from "react";

import Jumbotron from "./components/jumbotron";
import FeatureGrid from "./components/feature-grid";

export default class HomePreview extends React.Component {
  render() {
    const {entry, getAsset} = this.props;
    let image = getAsset(entry.getIn(["data", "image"]));

    // Bit of a nasty hack to make relative paths work as expected as a background image here
    if (image && !image.fileObj) {
        image = window.parent.location.protocol + "//" + window.parent.location.host + image;
    }

    const plusImage = entry.getIn(["data", "plus", "image"]);

    return <div>
        <Jumbotron
          image={image}
          title={entry.getIn(["data", "title"])}
          subtitle={entry.getIn(["data", "subtitle"])}
          buttonText={entry.getIn(["data", "cta", "text"])}/>

        <div className="bg-grey-1 pv4">
          <div className="flex-l mhn1-l ph3 center mw7">
            <h2 className="f2 b lh-title mb2 w-40-l">{entry.getIn(["data", "blurb", "heading"])}</h2>
            <p className="w-60-l mb0">{entry.getIn(["data", "blurb", "text"])}</p>
          </div>
        </div>

        <FeatureGrid
          heading={entry.getIn(["data", "intro", "heading"])}
          description={entry.getIn(["data", "intro", "text"])}
          items={entry.getIn(["data", "steps"])}
          getAsset={getAsset}
          buttonText="See all features"/>

        <div className="bg-grey-1 pv4">
          <div className="ph3 mw7 center">
            <div className="flex-l mhn2-l items-center">
              <div className="w-40-l ph2-l mb4 mb0-l">
                <h2 className="f2 b lh-title mb2">{entry.getIn(["data", "sample", "heading"])}</h2>
                <p>{entry.getIn(["data", "sample", "text"])}</p>
              </div>

              <div className="w-60-l ph2-l">
                <div className="bg-white ba b--grey-2 br1 pa3 pa4-l">
                  <p className="f6 b grey-3 ttu mb2">Example entry · {entry.getIn(["data", "sample", "date"])}</p>
                  <p className="f4 lh-copy mb3">“{entry.getIn(["data", "sample", "quote"])}”</p>
                  <div>
                    {(entry.getIn(["data", "sample", "tags"]) || []).map((tag, i) => <span className="chip" key={i}>
                      <span className="chip-label">{tag.get("label")}</span> {tag.get("value")}
                    </span>)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-highlight pv4">
          <div className="ph3 mw7 center">

            <div className="flex-l mhn2-l items-center">
              <div className="w-40-l ph2-l">
                <h2 className="f2 b lh-title mb2">{entry.getIn(["data", "plus", "heading"])}</h2>

                <p>{entry.getIn(["data", "plus", "text"])}</p>
              </div>

              <div className="w-60-l ph2-l">
                <img
                  src={plusImage && getAsset(plusImage)}
                  alt={entry.getIn(["data", "plus", "imageAlt"])}
                  className="db center mb3"
                  style={{maxWidth: "360px", width: "100%"}}/>
              </div>
            </div>

            <div className="tc">
              <a href="#" className="btn raise">See pricing</a>
            </div>

          </div>
        </div>

    </div>
  }
}
