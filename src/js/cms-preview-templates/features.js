import React from "react";

import Jumbotron from "./components/jumbotron";
import FeatureGrid from "./components/feature-grid";

export default class FeaturesPreview extends React.Component {
  render() {
    const {entry, getAsset} = this.props;
    let image = getAsset(entry.getIn(["data", "image"]));

    // Bit of a nasty hack to make relative paths work as expected as a background image here
    if (image && !image.fileObj) {
      image = window.parent.location.protocol + "//" + window.parent.location.host + image;
    }

    return <div>
      <Jumbotron
        image={image}
        title={entry.getIn(["data", "title"])}
        subtitle={entry.getIn(["data", "subtitle"])} />

      <FeatureGrid
        heading={entry.getIn(["data", "free", "heading"])}
        description={entry.getIn(["data", "free", "description"])}
        items={entry.getIn(["data", "free", "items"])}
        getAsset={getAsset} />

      <FeatureGrid
        bg="bg-grey-1"
        heading={entry.getIn(["data", "plus", "heading"])}
        description={entry.getIn(["data", "plus", "description"])}
        items={entry.getIn(["data", "plus", "items"])}
        getAsset={getAsset} />

      <div className="bg-off-white pv4">
        <div className="ph3 mw7 center">

          <h2 className="f2 b lh-title mb3">{entry.getIn(['data', 'pricing', 'heading'])}</h2>
          <p className="mw6 mb4">{entry.getIn(['data', 'pricing', 'description'])}</p>

          <div className="flex-ns mhn2-ns">
            {(entry.getIn(['data', 'pricing', 'plans']) || []).map((plan, index, plans) => <div className={`${plans.size === 2 ? "w-50-ns" : "w-33-ns"} ph2 mb4 mb0-ns`} key={index}>
              <div className="ph2">

                <h3 className="b f5 grey-3 tc lh-title mb3">{plan.get('plan')}</h3>

                <p className="primary f1 b tc lh-title center mb1">
                  <span className="f4">$</span>{plan.get('price')}
                </p>
                <p className="grey-3 f6 b tc mb3">{plan.get('period') || " "}</p>

                <p className="b">{plan.get('description')}</p>

                <ul>
                  {(plan.get('items') || []).map((item, index) => <li key={index}>
                    <p className={index + 1 !== plan.get('items').size ? "pb2 mb2 divider-grey" : null}>{item}</p>
                  </li>)}
                </ul>

              </div>

            </div>)}
          </div>
        </div>
      </div>
    </div>;
  }
}
