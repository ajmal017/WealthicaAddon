import { Component, OnInit, ViewChild, AfterViewInit, ChangeDetectorRef, AfterViewChecked } from '@angular/core';
import { PortfolioOverviewComponent, EditPortfolioComponent, PortfolioDetailsComponent, TradesNeededComponent, WidgetView} from './views';
import { PortfolioTemplate, PortfolioComponent, WealthicaPosition, WealthicaInvestment, WealthicaSecurity, WealthicaData, WealthicaInstitution } from './models';
import * as wealth from '@wealthica/wealthica.js';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss','./header.component.scss']
})
export class AppComponent implements OnInit, AfterViewInit {

  currentView = WidgetView.PortfolioOverview;
  portfolio: PortfolioTemplate;
  result = '';

  addon = new wealth.Addon({
    // (optional) The 'id' of the add-on / widget.
    // This is only required in the add-on release preparation process.
    // For add-on development with the Developer Add-on, this should not be set.
    // id: 'addon-id' | 'addon-id/widgets/widget-id'
  });
  addonOptions;
  positions: WealthicaPosition[] = null;

  @ViewChild(PortfolioOverviewComponent, {static: false})
    portfolioOverviewComponent: PortfolioOverviewComponent;
  @ViewChild(EditPortfolioComponent, {static: false})
    editPortfolioComponent: EditPortfolioComponent;
  @ViewChild(PortfolioDetailsComponent, {static: false})
    portfolioDetailsComponent: PortfolioDetailsComponent;
  @ViewChild(TradesNeededComponent, {static: false})
    tradesNeededComponent: TradesNeededComponent;

  constructor(private cdr: ChangeDetectorRef) { }

  ngOnInit() {
    this.initializeWealthicaAddon();
  }

  ngAfterViewInit() {
    this.initializeViews();
    this.cdr.detectChanges();
  }

  initializeWealthicaAddon() {
    this.addon.on('init', (options) => {
      this.refreshWealthicaData(options);
    });

    this.addon.on('update', (options) => {
      console.log('update');
      this.clearData();
      this.refreshWealthicaData(options);
    });

    this.addon.on('reload', (options) => {
      console.log('reload');
      this.clearData();
      this.refreshWealthicaData(options);
    });
  }

  refreshWealthicaData(options: object) {
      // {
      //   fromDate: '2018-01-01',
      //   toDate: '2018-04-30',
      //   language: 'en',
      //   privateMode: false,
      //   data: { portfolios: [, , ] },
      //   ...
      // }
      this.addonOptions = options;
      this.loadFromWealthica();
      this.addon.api.getPositions(this.getQueryFromOptions(options)).then(response => {
        // this.result = JSON.stringify(response);
        this.positions = response as WealthicaPosition[];
        this.updateSharesOwned();
      }).catch((err) => {
        console.log('Error:<br><code>' + err + '</code>');
      });
      this.addon.api.getInstitutions(this.getQueryFromOptions(options)).then(response => {
        const institutions = (response as WealthicaInstitution[]);
        this.setCash(institutions);
      }).catch((err) => {
        console.log('Error:<br><code>' + err + '</code>');
      });
  }

  clearData() {
    this.tradesNeededComponent.cashCAD = 0;
    this.tradesNeededComponent.cashUSD = 0;
  }

  saveToWealthica() {
    const wealicaData = { portfolios: this.portfolioOverviewComponent.portfolios };
    this.addon.saveData(wealicaData).then(() => {
    });
  }

  loadFromWealthica() {
    if (this.addonOptions !== null && this.addonOptions.data !== undefined && this.addonOptions.data as WealthicaData !== null) {
      this.portfolioOverviewComponent.portfolios = [];
      (this.addonOptions.data as WealthicaData).portfolios.forEach(portfolio => {
        const p = new PortfolioTemplate();
        p.portfolioName = portfolio.portfolioName;
        p.id = portfolio.id;
        p.loadPortfolioData(portfolio);
        this.portfolioOverviewComponent.portfolios.push(p);
      });
      this.portfolioOverviewComponent.portfolio = this.portfolioOverviewComponent.portfolios[0];
    } else {
      this.portfolioOverviewComponent.portfolios = [];
      const portfolio = new PortfolioTemplate();
      portfolio.portfolioName = 'New Portfolio';
      this.portfolioOverviewComponent.portfolios.push(portfolio);
      this.portfolioOverviewComponent.portfolio = portfolio;
    }
    if (this.portfolio === null || this.portfolio === undefined) {
      this.syncPortfolios(this.portfolioOverviewComponent.portfolio);
    }
  }

  setCash(institutions: WealthicaInstitution[]) {
    institutions.forEach(institution => {
      if (this.addonOptions.institutionsFilter === null || (this.addonOptions.institutionsFilter as string).includes(institution.id)) {
        institution.investments.forEach((investment: WealthicaInvestment) => {
          if (investment.currency === 'cad') {
            this.tradesNeededComponent.cashCAD += investment.cash;
          } else if (investment.currency === 'usd') {
            this.tradesNeededComponent.cashUSD += investment.cash;
          } else {
            this.tradesNeededComponent.cashOther += investment.cash;
          }
        });
      }
    });
    this.tradesNeededComponent.refreshTradesNeeded();
  }

  onPortfolioSave(portfolio: PortfolioTemplate) {
    this.syncPortfolios(portfolio);
    this.saveToWealthica();
  }

  onEditCancel(restoredPortfolio: PortfolioTemplate) {
    if (restoredPortfolio === null) {
      this.loadFromWealthica();
    } else {
      this.syncPortfolios(restoredPortfolio);
    }
  }

  updateSharesOwned() {
    if (this.positions !== null) {
      this.portfolio.components.forEach(component => {
        component.sharesOwned = 0;
        this.positions.forEach(position => {
          if (position.security.currency.toLowerCase() === 'cad') {
            if (component.symbol === position.security.symbol + '.TO') {
              component.sharesOwned = position.quantity;
            } else if (component.symbol === position.security.symbol + '.VN') {
              component.sharesOwned = position.quantity;
            } else if (component.symbol === position.security.symbol + '.CN') {
              component.sharesOwned = position.quantity;
            }
          } else if (component.symbol === position.security.symbol) {
            component.sharesOwned = position.quantity;
          }
        });
      });
    }
  }

  getQueryFromOptions(options): any {
    return {
      from: options.dateRangeFilter && options.dateRangeFilter[0],
      to: options.dateRangeFilter && options.dateRangeFilter[1],
      groups: options.groupsFilter,
      institutions: options.institutionsFilter,
      investments: options.investmentsFilter === 'all' ? null : options.investmentsFilter,
    };
  }

  syncPortfolios(portfolio: PortfolioTemplate, afterDelete = false) {
    this.portfolio = portfolio;
    this.editPortfolioComponent.updatePortfolio(this.portfolio);
    this.editPortfolioComponent.saveState = JSON.parse(JSON.stringify(portfolio)) as PortfolioTemplate;
    this.portfolioDetailsComponent.portfolio = this.portfolio;
    this.portfolioDetailsComponent.updatePiechart();
    this.tradesNeededComponent.portfolio = this.portfolio;
    if (!afterDelete) {
      this.updateSharesOwned();
      this.updateOrAddPortfolio(portfolio);
    }
  }

  updateOrAddPortfolio(portfolio: PortfolioTemplate) {
    let updated = false;
    this.portfolioOverviewComponent.portfolios.forEach(p => {
      if (portfolio.id === p.id) {
        p = portfolio;
        updated = true;
      }
    });
    if (!updated) {
      this.portfolioOverviewComponent.portfolios.push(portfolio);
    }
  }

  switchView(view: WidgetView) {
    this.updateCurrentView(view);
  }

  updateCurrentView(view: WidgetView) {
    this.currentView = view;
    this.portfolioDetailsComponent.currentView = view;
    this.portfolioOverviewComponent.currentView = view;
    this.editPortfolioComponent.currentView = view;
    this.tradesNeededComponent.currentView = view;
  }

  overviewView() {
    return this.currentView === WidgetView.PortfolioOverview;
  }
  editView() {
    return this.currentView === WidgetView.EditPortfolio;
  }
  detailsView() {
    return this.currentView === WidgetView.PortfolioDetails;
  }
  tradesView() {
    return this.currentView === WidgetView.TradesNeeded;
  }

  initializeViews() {
    this.editPortfolioComponent.currentView = this.currentView;
    this.portfolioDetailsComponent.currentView = this.currentView;
    this.portfolioOverviewComponent.currentView = this.currentView;
    this.tradesNeededComponent.currentView = this.currentView;
  }

  onSwitchPortfolio(portfolio: PortfolioTemplate) {
    this.syncPortfolios(portfolio);
  }

  onDeletePortfolio(portfolio: PortfolioTemplate) {
    const indexToDelete = this.portfolioOverviewComponent.portfolios.indexOf(portfolio);
    this.portfolioOverviewComponent.portfolios.splice(indexToDelete, 1);
    this.saveToWealthica();
    this.syncPortfolios(new PortfolioTemplate(), true);
    this.switchView(WidgetView.PortfolioOverview);
  }

  onSwitchView(view: WidgetView) {
    if (view === WidgetView.TradesNeeded) {
      this.tradesNeededComponent.refreshTradesNeeded();
    }
    this.switchView(view);
  }

  onNewPortfolio() {
    // Wipe save state so that new portfolio gets deleted if user cancels
    this.editPortfolioComponent.saveState = null;
  }

  onImportPortfolio(portfolio: PortfolioTemplate) {
    let totalPortfolioValue = this.tradesNeededComponent.cashCAD;
    if (this.positions.length === 0) {
      this.editPortfolioComponent.noImportData = true;
    }
    this.positions.forEach(position => {
      totalPortfolioValue += position.market_value;
    });

    this.positions.forEach(position => {
      const component = new PortfolioComponent(
        position.security.symbol,
        position.market_value  / totalPortfolioValue
        );
      component.displayPercent = parseFloat(((position.market_value  / totalPortfolioValue) * 100).toFixed(2));
      portfolio.components.push(component);
    });

    this.syncPortfolios(portfolio);
    this.editPortfolioComponent.saveState = null;
    this.switchView(WidgetView.EditPortfolio);
  }
}
